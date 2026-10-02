import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt } from "../../lib/encryption.js";
import { migrate as migrationLogger } from "../../logger.js";
import * as settingsTable from "../../migrations/20190227065017_settings.js";
import * as acmeOptions from "../../migrations/20260930000400_add_acme_options.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "ab".repeat(32) }));
vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

const defaultOptions = {
	server: "https://acme-v02.api.letsencrypt.org/directory",
	email: "",
	account_id: "",
	eab_kid: "",
	encrypted_eab_hmac_key: "",
	agree_tos: true,
	must_staple: false,
	ocsp_stapling: false,
	server_tls_verify: true,
	custom_ocsp_stapling: false,
	default_certificate_id: 0,
};
const syntheticSecret = "SYNTHETIC_EAB_SECRET_FOR_MIGRATION_TESTS";
const decodeMeta = ({ meta }) => (typeof meta === "string" ? JSON.parse(meta) : meta);
const legacyKeys = [
	"ACME_SERVER",
	"ACME_EMAIL",
	"ACME_EAB_KID",
	"ACME_EAB_HMAC_KEY",
	"ACME_MUST_STAPLE",
	"ACME_OCSP_STAPLING",
	"ACME_SERVER_TLS_VERIFY",
	"CUSTOM_OCSP_STAPLING",
	"DEFAULT_CERT_ID",
];
const stubLegacyEnvironment = (values = {}) => {
	for (const key of legacyKeys) {
		vi.stubEnv(key, values[key]);
	}
};

describe.each(["sqlite", "postgres"])("ACME options migration on %s", (engine) => {
	let embedded;
	let database;
	let unrelatedRows;
	const getOptions = async () => decodeMeta(await database("setting").where({ id: "acme-options" }).first());

	beforeEach(async () => {
		embedded = engine === "postgres" ? await createPostgres() : null;
		database =
			embedded?.database ||
			knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		await settingsTable.up(database);
		await database("setting").insert({
			id: "certificate-options",
			name: "Certificate Options",
			description: "Keep existing certificate configuration",
			value: "configured",
			meta: JSON.stringify({ key_type: "rsa", renewal_interval_hours: 6 }),
		});
		unrelatedRows = await database("setting").orderBy("id");
		stubLegacyEnvironment();
		vi.clearAllMocks();
	}, 30000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		if (embedded) await embedded.close();
		else await database?.destroy();
	});

	it("creates application defaults when legacy values are absent or empty", async () => {
		for (const value of [undefined, ""]) {
			await database("setting").where({ id: "acme-options" }).delete();
			stubLegacyEnvironment(Object.fromEntries(legacyKeys.map((key) => [key, value])));
			await acmeOptions.up(database);
			expect(await getOptions()).toEqual(defaultOptions);
			expect(await database("setting").where({ id: "acme-options" }).first()).toMatchObject({
				id: "acme-options",
				value: "configured",
			});
		}
		expect(migrationLogger.warn).not.toHaveBeenCalled();
	});

	it("imports all legacy controls and encrypts the HMAC key before storage", async () => {
		stubLegacyEnvironment({
			ACME_SERVER: "https://ca.example.test/acme/directory",
			ACME_EMAIL: "account@example.test",
			ACME_EAB_KID: "synthetic-kid",
			ACME_EAB_HMAC_KEY: syntheticSecret,
			ACME_MUST_STAPLE: "true",
			ACME_OCSP_STAPLING: "false",
			ACME_SERVER_TLS_VERIFY: "false",
			CUSTOM_OCSP_STAPLING: "true",
			DEFAULT_CERT_ID: "42",
		});
		await acmeOptions.up(database);
		const policy = await getOptions();
		expect(policy).toEqual({
			...defaultOptions,
			server: "https://ca.example.test/acme/directory",
			email: "account@example.test",
			eab_kid: "synthetic-kid",
			encrypted_eab_hmac_key: expect.stringMatching(/^[a-f0-9]{24}:[a-f0-9]+:[a-f0-9]{32}$/),
			must_staple: true,
			ocsp_stapling: true,
			server_tls_verify: false,
			custom_ocsp_stapling: true,
			default_certificate_id: 42,
		});
		expect(decrypt(policy.encrypted_eab_hmac_key)).toBe(syntheticSecret);
		expect(JSON.stringify(await database("setting").where({ id: "acme-options" }).first())).not.toContain(
			syntheticSecret,
		);
		expect(policy).not.toHaveProperty("eab_hmac_key");
		expect(migrationLogger.warn).not.toHaveBeenCalled();
	});

	it("preserves invalid account values and partial EAB credentials for repair without logging them", async () => {
		for (const secret of ["", syntheticSecret]) {
			await database("setting").where({ id: "acme-options" }).delete();
			stubLegacyEnvironment({
				ACME_SERVER: "INVALID_SYNTHETIC_SERVER",
				ACME_EMAIL: "INVALID_SYNTHETIC_EMAIL",
				ACME_EAB_KID: secret ? "" : "synthetic-kid",
				ACME_EAB_HMAC_KEY: secret,
			});
			vi.clearAllMocks();
			await acmeOptions.up(database);
			const policy = await getOptions();
			expect(policy.server).toBe("INVALID_SYNTHETIC_SERVER");
			expect(policy.email).toBe("INVALID_SYNTHETIC_EMAIL");
			expect(policy.eab_kid).toBe(secret ? "" : "synthetic-kid");
			if (secret) expect(decrypt(policy.encrypted_eab_hmac_key)).toBe(secret);
			else expect(policy.encrypted_eab_hmac_key).toBe("");
			expect(migrationLogger.warn).toHaveBeenCalledTimes(3);
			const logs = JSON.stringify(vi.mocked(migrationLogger.warn).mock.calls);
			for (const privateValue of ["INVALID_SYNTHETIC_SERVER", "INVALID_SYNTHETIC_EMAIL", syntheticSecret]) {
				expect(logs).not.toContain(privateValue);
			}
		}
	});

	it("preserves EAB credentials without email for an administrator to repair", async () => {
		stubLegacyEnvironment({ ACME_EAB_KID: "synthetic-kid", ACME_EAB_HMAC_KEY: syntheticSecret });
		await acmeOptions.up(database);
		const policy = await getOptions();
		expect(policy.email).toBe("");
		expect(policy.eab_kid).toBe("synthetic-kid");
		expect(decrypt(policy.encrypted_eab_hmac_key)).toBe(syntheticSecret);
		expect(migrationLogger.warn).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(vi.mocked(migrationLogger.warn).mock.calls)).not.toContain(syntheticSecret);
	});

	it("normalizes invalid boolean controls to their defaults with fixed warnings", async () => {
		stubLegacyEnvironment({
			ACME_MUST_STAPLE: "INVALID_SYNTHETIC_FLAG",
			ACME_OCSP_STAPLING: "INVALID_SYNTHETIC_FLAG",
			ACME_SERVER_TLS_VERIFY: "INVALID_SYNTHETIC_FLAG",
			CUSTOM_OCSP_STAPLING: "INVALID_SYNTHETIC_FLAG",
		});
		await acmeOptions.up(database);
		expect(await getOptions()).toEqual(defaultOptions);
		expect(migrationLogger.warn).toHaveBeenCalledTimes(4);
		expect(JSON.stringify(vi.mocked(migrationLogger.warn).mock.calls)).not.toContain("INVALID_SYNTHETIC_FLAG");
	});

	it("keeps malformed legacy EAB values encrypted and warns without logging their contents", async () => {
		const invalidSecret = "SYNTHETIC_INVALID_SECRET!";
		stubLegacyEnvironment({
			ACME_SERVER: "https://ca.example.test/directory#fragment",
			ACME_EMAIL: "account@legacy",
			ACME_EAB_KID: "synthetic invalid kid",
			ACME_EAB_HMAC_KEY: invalidSecret,
		});
		await acmeOptions.up(database);
		const policy = await getOptions();
		expect(policy.server).toBe("https://ca.example.test/directory#fragment");
		expect(policy.email).toBe("account@legacy");
		expect(policy.eab_kid).toBe("synthetic invalid kid");
		expect(decrypt(policy.encrypted_eab_hmac_key)).toBe(invalidSecret);
		expect(migrationLogger.warn).toHaveBeenCalledTimes(4);
		const warnings = JSON.stringify(vi.mocked(migrationLogger.warn).mock.calls);
		for (const raw of [policy.server, policy.email, policy.eab_kid, invalidSecret]) {
			expect(warnings).not.toContain(raw);
		}
		expect(JSON.stringify(await database("setting").where({ id: "acme-options" }).first())).not.toContain(
			invalidSecret,
		);
	});

	it("accepts safe default certificate IDs and resets invalid IDs without logging values", async () => {
		for (const [raw, expected] of /** @type {[string, number][]} */ ([
			["0", 0],
			["00042", 42],
			["9007199254740991", Number.MAX_SAFE_INTEGER],
			["-1", 0],
			["1.5", 0],
			["42suffix", 0],
			["9007199254740992", 0],
			[" ", 0],
		])) {
			await database("setting").where({ id: "acme-options" }).delete();
			stubLegacyEnvironment({ DEFAULT_CERT_ID: raw });
			vi.clearAllMocks();
			await acmeOptions.up(database);
			expect((await getOptions()).default_certificate_id).toBe(expected);
			if (expected === 0 && raw !== "0") {
				expect(vi.mocked(migrationLogger.warn).mock.calls).toEqual([
					["[add_acme_options] Legacy DEFAULT_CERT_ID requires review in the ACME settings."],
				]);
			} else expect(migrationLogger.warn).not.toHaveBeenCalled();
		}
	});

	it("preserves saved fields and ciphertext across repeat imports and removes only its row on rollback", async () => {
		stubLegacyEnvironment({
			ACME_EAB_KID: "synthetic-kid",
			ACME_EAB_HMAC_KEY: syntheticSecret,
			ACME_EMAIL: "a@example.test",
		});
		await acmeOptions.up(database);
		const savedRow = await database("setting").where({ id: "acme-options" }).first();
		stubLegacyEnvironment({ ACME_SERVER: "INVALID_SYNTHETIC_SERVER", ACME_EAB_HMAC_KEY: "DIFFERENT_SECRET" });
		vi.clearAllMocks();
		await acmeOptions.up(database);
		await acmeOptions.up(database);
		expect(await database("setting").where({ id: "acme-options" }).first()).toEqual(savedRow);
		expect(migrationLogger.warn).not.toHaveBeenCalled();
		await acmeOptions.down(database);
		await acmeOptions.down(database);
		expect(await database("setting").orderBy("id")).toEqual(unrelatedRows);
		stubLegacyEnvironment();
		await acmeOptions.up(database);
		expect(await getOptions()).toEqual(defaultOptions);
	});

	it("rolls back imported encrypted credentials with its database transaction", async () => {
		stubLegacyEnvironment({
			ACME_EAB_KID: "synthetic-kid",
			ACME_EAB_HMAC_KEY: syntheticSecret,
			ACME_EMAIL: "a@example.test",
		});
		await expect(
			database.transaction(async (transaction) => {
				await acmeOptions.up(transaction);
				throw new Error("Synthetic transaction failure");
			}),
		).rejects.toThrow("Synthetic transaction failure");
		expect(await database("setting").orderBy("id")).toEqual(unrelatedRows);
	});
});
