import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	query: vi.fn(),
	audit: vi.fn(),
	apply: vi.fn(),
	validateProfile: vi.fn(),
}));
vi.mock("../../models/setting.js", async () => {
	const { Model } = await import("objection");
	class Setting extends Model {
		static get tableName() {
			return "setting";
		}
		static get jsonAttributes() {
			return ["meta"];
		}
	}
	return { default: { query: (trx) => state.query(trx) || Setting.query(trx || state.db) } };
});
vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "12".repeat(32) }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/acme-profile.js", () => ({
	default: { getPolicy: async () => "standard", validatePolicyForServer: state.validateProfile },
}));
vi.mock("../../internal/acme-tls.js", () => ({ default: { applyPolicy: state.apply } }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));

import acme from "../../internal/acme-options.js";
import { redactAcmeSetting } from "../../internal/acme-options-public.js";
import setting from "../../internal/setting.js";
import { decrypt, encrypt } from "../../lib/encryption.js";
import errs from "../../lib/error.js";

const access = { can: vi.fn() };
const ordinary = {
	server: "https://acme-v02.api.letsencrypt.org/directory",
	email: "",
	account_id: "",
	eab_kid: "",
	agree_tos: true,
	must_staple: false,
	ocsp_stapling: false,
	server_tls_verify: true,
	custom_ocsp_stapling: false,
	default_certificate_id: 0,
};
const key = "c3ludGhldGljLWVhYi1rZXk";
const credentialUpdate = { ...ordinary, email: "admin@example.org", eab_kid: "synthetic-kid", eab_hmac_key: key };

describe("saved ACME options and write-only EAB credentials", () => {
	let directory;
	beforeEach(async () => {
		vi.resetAllMocks();
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-acme-options-"));
		state.db = knex({
			client: "better-sqlite3",
			connection: { filename: path.join(directory, "db.sqlite") },
			useNullAsDefault: true,
		});
		await state.db.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.string("value");
			table.string("description");
			table.text("meta");
		});
		await state.db("setting").insert({
			id: "acme-options",
			value: "configured",
			meta: JSON.stringify({ ...ordinary, encrypted_eab_hmac_key: "" }),
		});
		state.apply.mockImplementation(async (_policy, persist) => state.db.transaction(persist));
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		await state.db.destroy();
		fs.rmSync(directory, { recursive: true, force: true });
	});
	const readRow = async () => {
		const row = await state.db("setting").where({ id: "acme-options" }).first();
		return { ...row, meta: JSON.parse(row.meta) };
	};
	it("ignores retired environment options and checks permissions before reading or writing", async () => {
		vi.stubEnv("ACME_SERVER", "http://ignored.invalid/directory");
		expect(await acme.get(access)).toEqual({ ...ordinary, eab_hmac_key_set: false });
		state.query.mockClear();
		access.can.mockRejectedValue(new errs.PermissionError());
		await expect(acme.get(access)).rejects.toMatchObject({ status: 403 });
		await expect(acme.update(access, ordinary)).rejects.toMatchObject({ status: 403 });
		expect(state.query).not.toHaveBeenCalled();
	});
	it("encrypts replacement keys, decrypts only for runtime, and redacts every public/audit path", async () => {
		const saved = await acme.update(access, credentialUpdate);
		const row = await readRow();
		expect(row.meta.encrypted_eab_hmac_key).not.toBe(key);
		expect(decrypt(row.meta.encrypted_eab_hmac_key)).toBe(key);
		expect(saved).toEqual({
			...ordinary,
			email: credentialUpdate.email,
			eab_kid: credentialUpdate.eab_kid,
			eab_hmac_key_set: true,
		});
		expect(await acme.getRuntimePolicy()).toEqual({
			...ordinary,
			email: credentialUpdate.email,
			eab_kid: credentialUpdate.eab_kid,
			eab_hmac_key: key,
		});
		const allPublic = [
			await acme.get(access),
			await setting.get(access, { id: "acme-options" }),
			await setting.getAll(access),
			state.audit.mock.calls,
		];
		for (const value of allPublic) {
			expect(JSON.stringify(value)).not.toContain(key);
			expect(JSON.stringify(value)).not.toContain(row.meta.encrypted_eab_hmac_key);
			expect(JSON.stringify(value)).not.toContain("encrypted_eab_hmac_key");
		}
		expect(redactAcmeSetting({ ...row, meta: { ...row.meta, eab_hmac_key: key, private_key: key } }).meta).toEqual(
			saved,
		);
	});
	it("retains omitted credentials, replaces a secret-only edit, and clears an explicit null/pair", async () => {
		await acme.update(access, credentialUpdate);
		const first = (await readRow()).meta.encrypted_eab_hmac_key;
		const { eab_hmac_key: _secret, ...retained } = credentialUpdate;
		await acme.update(access, { ...retained, email: "changed@example.org" });
		expect((await readRow()).meta.encrypted_eab_hmac_key).toBe(first);
		await acme.update(access, { ...retained, eab_hmac_key: "cmVwbGFjZW1lbnQ" });
		expect((await acme.getRuntimePolicy()).eab_hmac_key).toBe("cmVwbGFjZW1lbnQ");
		await acme.update(access, { ...ordinary, eab_hmac_key: null });
		expect((await readRow()).meta.encrypted_eab_hmac_key).toBe("");
		expect((await acme.get(access)).eab_hmac_key_set).toBe(false);
	});
	it("requires deliberate replacement or clearance before credentials can move to another server/KID", async () => {
		await acme.update(access, credentialUpdate);
		const { eab_hmac_key: _secret, ...retained } = credentialUpdate;
		await expect(
			acme.update(access, { ...retained, server: "https://other.example.org/acme" }),
		).rejects.toMatchObject({ status: 400 });
		await expect(acme.update(access, { ...retained, eab_kid: "another-kid" })).rejects.toMatchObject({
			status: 400,
		});
		await acme.update(access, { ...ordinary, server: "https://other.example.org/acme", eab_hmac_key: null });
		expect((await acme.get(access)).server).toBe("https://other.example.org/acme");
	});
	it.each([
		{},
		null,
		[],
		{ ...ordinary, extra: true },
		{ ...ordinary, eab_hmac_key_set: false },
		{ ...ordinary, server: "https://username:password@ca.example.org/directory" },
		{ ...ordinary, email: "invalid-email" },
		{ ...ordinary, account_id: "../outside" },
		{ ...ordinary, eab_kid: "id\nserver = http://injected" },
		{ ...ordinary, eab_hmac_key: "" },
		{ ...ordinary, eab_hmac_key: false },
		{ ...ordinary, eab_hmac_key: "synthetic-secret\nserver = http://injected" },
		{ ...ordinary, default_certificate_id: Number.MAX_SAFE_INTEGER + 1 },
		{ ...ordinary, must_staple: true, ocsp_stapling: true },
		{ ...ordinary, server: "https://other.example.org/acme", must_staple: true },
		{ ...ordinary, server_tls_verify: "false" },
	])("rejects invalid ACME options without coercion or database writes", async (data) => {
		await expect(acme.update(access, data)).rejects.toMatchObject({ status: 400 });
		expect(state.query).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});
	it("keeps legacy invalid accounts editable while blocking certificate operations", async () => {
		await state
			.db("setting")
			.where({ id: "acme-options" })
			.update({
				meta: JSON.stringify({
					...ordinary,
					server: "invalid legacy URL",
					eab_kid: "partial",
					encrypted_eab_hmac_key: encrypt(key),
				}),
			});
		expect((await acme.get(access)).server).toBe("invalid legacy URL");
		await expect(acme.getRuntimePolicy()).rejects.toMatchObject({ name: "ConfigurationError" });
		await acme.update(access, { ...ordinary, eab_hmac_key: null });
		expect((await acme.getRuntimePolicy()).server).toBe(ordinary.server);
	});
	it("applies only TLS changes immediately and preserves the old row when activation fails", async () => {
		await acme.update(access, { ...ordinary, email: "admin@example.org" });
		expect(state.apply).not.toHaveBeenCalled();
		state.apply.mockImplementationOnce(async (_policy, persist) =>
			state.db.transaction(async (trx) => {
				await persist(trx);
				throw new Error("nginx rejected policy");
			}),
		);
		await expect(acme.update(access, { ...ordinary, custom_ocsp_stapling: true })).rejects.toThrow(
			"nginx rejected policy",
		);
		expect((await acme.get(access)).custom_ocsp_stapling).toBe(false);
		await acme.update(access, { ...ordinary, custom_ocsp_stapling: true });
		expect((await acme.get(access)).custom_ocsp_stapling).toBe(true);
	});
	it("refuses a CA that does not support the selected Short-lived profile before saving", async () => {
		state.validateProfile.mockRejectedValueOnce(new errs.ValidationError("Short-lived unavailable"));
		await expect(acme.update(access, { ...ordinary, server: "https://other.example.org/acme" })).rejects.toThrow(
			"Short-lived unavailable",
		);
		expect((await acme.get(access)).server).toBe(ordinary.server);
	});
	it("blocks generic mutation before any query", async () => {
		await expect(
			setting.update(access, { id: "acme-options", value: "configured", meta: credentialUpdate }),
		).rejects.toMatchObject({ status: 400 });
		expect(state.query).not.toHaveBeenCalled();
	});
});
