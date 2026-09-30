import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	query: vi.fn(),
	certificateQuery: vi.fn(),
	execFile: vi.fn(),
	audit: vi.fn(),
}));
vi.mock("../../models/setting.js", async () => {
	const { Model } = await import("objection");
	class Setting extends Model {
		static get tableName() {
			return "setting";
		}
	}
	return { default: { query: (...args) => state.query(...args) || Setting.query(state.db) } };
});
vi.mock("../../models/certificate.js", async () => {
	const { Model } = await import("objection");
	class Certificate extends Model {
		static get tableName() {
			return "certificate";
		}
		static get jsonAttributes() {
			return ["domain_names", "meta"];
		}
	}
	return { default: { query: (...args) => state.certificateQuery(...args) || Certificate.query(state.db) } };
});
vi.mock("../../lib/utils.js", () => ({ default: { execFile: state.execFile } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));

import profile from "../../internal/acme-profile.js";
import errs from "../../lib/error.js";

const access = { can: vi.fn() };
const help = "--required-profile PROFILE --preferred-profile PROFILE";
const directory = JSON.stringify({ meta: { profiles: { shortlived: "https://ca.example.test/profile" } } });
const insertCertificate = (overrides = {}) =>
	state.db("certificate").insert({
		id: 41,
		provider: "letsencrypt",
		is_deleted: 0,
		domain_names: JSON.stringify(Array.from({ length: 26 }, (_, index) => `host${index}.example.test`)),
		meta: JSON.stringify({}),
		...overrides,
	});

describe("persistent ACME profile defaults", () => {
	let temporaryDirectory;
	let databaseConfig;

	beforeEach(async () => {
		vi.resetAllMocks();
		vi.stubEnv("ACME_SERVER", "");
		vi.stubEnv("ACME_SERVER_TLS_VERIFY", "");
		temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-acme-profile-"));
		databaseConfig = {
			client: "better-sqlite3",
			connection: { filename: path.join(temporaryDirectory, "settings.sqlite") },
			useNullAsDefault: true,
		};
		state.db = knex(databaseConfig);
		await state.db.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.string("value");
		});
		await state.db("setting").insert({ id: "acme-profile", value: "standard" });
		await state.db.schema.createTable("certificate", (table) => {
			table.integer("id").primary();
			table.string("provider");
			table.integer("is_deleted");
			table.text("domain_names");
			table.text("meta");
		});
		state.execFile.mockImplementation(async (command) => (command === "certbot" ? help : directory));
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await state.db.destroy();
		fs.rmSync(temporaryDirectory, { recursive: true, force: true });
	});

	it.each(["", "none", "classic", "custom-profile", "shortlived", "shortlived --force-renewal"])(
		"ignores the removed ACME_PROFILE=%s environment control",
		async (environment) => {
			vi.stubEnv("ACME_PROFILE", environment);
			expect(await profile.getPolicy()).toBe("standard");
			expect(await profile.get(access)).toEqual({ profile: "standard" });
			expect(access.can).toHaveBeenCalledWith("certificates:list");
			expect(state.execFile).not.toHaveBeenCalled();
		},
	);

	it("defaults missing settings to Standard without an environment fallback", async () => {
		await state.db("setting").delete();
		vi.stubEnv("ACME_PROFILE", "shortlived");
		expect(await profile.getPolicy()).toBe("standard");
		expect(await profile.get(access)).toEqual({ profile: "standard" });
	});

	it.each(["invalid", "", "SHORTLIVED", "inherit"])(
		"rejects corrupt or unmigrated saved policy %s",
		async (value) => {
			await state.db("setting").update({ value });
			await expect(profile.get(access)).rejects.toMatchObject({ name: "ConfigurationError", status: 400 });
		},
	);

	it.each(["get", "update"])(
		"checks %s permissions before reading settings or executing external commands",
		async (operation) => {
			access.can.mockRejectedValue(new errs.PermissionError());
			await expect(
				operation === "get" ? profile.get(access) : profile.update(access, { profile: "shortlived" }),
			).rejects.toMatchObject({ status: 403 });
			expect(state.query).not.toHaveBeenCalled();
			expect(state.certificateQuery).not.toHaveBeenCalled();
			expect(state.execFile).not.toHaveBeenCalled();
			expect(state.audit).not.toHaveBeenCalled();
			expect(access.can).toHaveBeenCalledWith(
				...(operation === "get" ? ["certificates:list"] : ["settings:update", "acme-profile"]),
			);
		},
	);

	it.each([undefined, null, "inherit", "classic", "shortlived --force-renewal"])(
		"rejects unsupported update value %s before client or database changes",
		async (value) => {
			await expect(profile.update(access, { profile: value })).rejects.toMatchObject({ status: 400 });
			expect(state.query).not.toHaveBeenCalled();
			expect(state.execFile).not.toHaveBeenCalled();
			expect(await profile.getPolicy()).toBe("standard");
		},
	);

	it.each(["standard", "shortlived"])(
		"persists %s across database reconnection regardless of changed environment",
		async (savedProfile) => {
			vi.stubEnv("ACME_PROFILE", savedProfile === "standard" ? "shortlived" : "standard");
			expect(await profile.update(access, { profile: savedProfile })).toEqual({ profile: savedProfile });
			if (savedProfile === "standard") {
				expect(state.execFile).toHaveBeenCalledExactlyOnceWith("certbot", ["--help", "all"]);
				expect(state.certificateQuery).not.toHaveBeenCalled();
			}
			await state.db.destroy();
			state.db = knex(databaseConfig);
			vi.stubEnv("ACME_PROFILE", "custom-profile --force-renewal");
			expect(await profile.getPolicy()).toBe(savedProfile);
			expect(await profile.get(access)).toEqual({ profile: savedProfile });
			expect(state.audit).toHaveBeenCalledExactlyOnceWith(access, {
				action: "updated",
				object_type: "setting",
				object_id: 0,
				meta: { setting_id: "acme-profile", name: "ACME Certificate Profile", value: savedProfile },
			});
		},
	);

	it("requires the selected CA to advertise shortlived before saving and auditing the default", async () => {
		vi.stubEnv("ACME_SERVER", "https://ca.example.test/directory");
		expect(await profile.update(access, { profile: "shortlived" })).toEqual({ profile: "shortlived" });
		expect(state.execFile.mock.calls).toEqual([
			["certbot", ["--help", "all"]],
			[
				"curl",
				[
					"--fail",
					"--silent",
					"--show-error",
					"--location",
					"--connect-timeout",
					"5",
					"--max-time",
					"10",
					"--",
					"https://ca.example.test/directory",
				],
			],
		]);
		expect(await profile.getPolicy()).toBe("shortlived");
		expect(state.audit.mock.calls[0][1].meta.value).toBe("shortlived");
	});

	it("honors configured CA TLS verification when checking the selected CA", async () => {
		vi.stubEnv("ACME_SERVER_TLS_VERIFY", "false");
		await profile.update(access, { profile: "shortlived" });
		expect(state.execFile.mock.calls[1][1]).toContain("--insecure");
		expect(state.execFile.mock.calls[1][1].at(-1)).toBe("https://acme-v02.api.letsencrypt.org/directory");
	});

	it.each([JSON.stringify({}), null])(
		"rejects a Short-lived global default for a legacy certificate with 26 domains and metadata %s",
		async (meta) => {
			await insertCertificate({ meta });
			await state.db("setting").update({ value: "standard" });
			await expect(profile.update(access, { profile: "shortlived" })).rejects.toMatchObject({
				status: 400,
				message:
					"Certificate 41 has more than 25 domain names and no explicit profile. Keep Standard or replace this certificate with certificates containing at most 25 domain names before selecting the global Short-lived default.",
			});
			expect(state.execFile).toHaveBeenCalledExactlyOnceWith("certbot", ["--help", "all"]);
			expect(await profile.getPolicy()).toBe("standard");
			expect(state.audit).not.toHaveBeenCalled();
			expect((await state.db("certificate").where({ id: 41 }).first()).meta).toBe(meta);
		},
	);

	it("allows legacy certificates with exactly 25 domains to adopt the Short-lived global default", async () => {
		await insertCertificate({
			domain_names: JSON.stringify(Array.from({ length: 25 }, (_, index) => `host${index}.example.test`)),
		});
		await expect(profile.update(access, { profile: "shortlived" })).resolves.toMatchObject({
			profile: "shortlived",
		});
		expect(await profile.getPolicy()).toBe("shortlived");
	});

	it.each([
		["explicit Standard", { meta: JSON.stringify({ letsencrypt_profile: "standard" }) }],
		["explicit Short-lived", { meta: JSON.stringify({ letsencrypt_profile: "shortlived" }) }],
		["deleted Let's Encrypt", { is_deleted: 1 }],
		["custom", { provider: "other" }],
		["internal", { provider: "internal" }],
	])("does not block Short-lived because of a 26-domain %s certificate", async (_label, overrides) => {
		await insertCertificate(overrides);
		await expect(profile.update(access, { profile: "shortlived" })).resolves.toMatchObject({
			profile: "shortlived",
		});
		expect(await profile.getPolicy()).toBe("shortlived");
	});

	it("keeps Standard selectable without reading certificates even when legacy certificates have 26 names", async () => {
		await insertCertificate();
		await expect(profile.update(access, { profile: "standard" })).resolves.toMatchObject({ profile: "standard" });
		expect(state.certificateQuery).not.toHaveBeenCalled();
		expect(state.execFile).toHaveBeenCalledExactlyOnceWith("certbot", ["--help", "all"]);
	});

	it.each(["", "--required-profile PROFILE", "--preferred-profile PROFILE"])(
		"keeps the saved default when Certbot help lacks required support: %s",
		async (clientHelp) => {
			await state.db("setting").update({ value: "standard" });
			state.execFile.mockResolvedValue(clientHelp);
			await expect(profile.update(access, { profile: "shortlived" })).rejects.toThrow("Certbot 4.0");
			expect(state.execFile).toHaveBeenCalledExactlyOnceWith("certbot", ["--help", "all"]);
			expect(await profile.getPolicy()).toBe("standard");
			expect(state.audit).not.toHaveBeenCalled();
		},
	);

	it.each([
		["missing metadata", "{}"],
		["missing shortlived", JSON.stringify({ meta: { profiles: { classic: "https://ca.example.test/classic" } } })],
		["invalid directory JSON", "unavailable"],
		["null directory", "null"],
	])("preserves the previous setting after %s", async (_label, response) => {
		await state.db("setting").update({ value: "standard" });
		state.execFile.mockResolvedValueOnce(help).mockResolvedValueOnce(response);
		await expect(profile.update(access, { profile: "shortlived" })).rejects.toMatchObject({ status: 400 });
		expect(await profile.getPolicy()).toBe("standard");
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("keeps the previous default after a failed CA request and reports a retryable validation error", async () => {
		await state.db("setting").update({ value: "standard" });
		state.execFile.mockResolvedValueOnce(help).mockRejectedValueOnce(new Error("connection failed"));
		await expect(profile.update(access, { profile: "shortlived" })).rejects.toMatchObject({
			status: 400,
			message: "Could not verify the ACME server's shortlived profile. Please try again.",
		});
		expect(await profile.getPolicy()).toBe("standard");
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("waits for the CA check before publishing a new default", async () => {
		let resolveDirectory;
		state.execFile.mockResolvedValueOnce(help).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveDirectory = resolve;
				}),
		);
		const updating = profile.update(access, { profile: "shortlived" });
		await vi.waitFor(() => expect(resolveDirectory).toBeTypeOf("function"));
		expect(await profile.getPolicy()).toBe("standard");
		expect(state.audit).not.toHaveBeenCalled();
		resolveDirectory(directory);
		await updating;
		expect(await profile.getPolicy()).toBe("shortlived");
	});

	it("preserves the old setting and avoids a success audit when the actual database write fails", async () => {
		await state.db("setting").update({ value: "shortlived" });
		await state.db.raw(
			"CREATE TRIGGER reject_profile BEFORE UPDATE ON setting BEGIN SELECT RAISE(ABORT, 'profile write failed'); END",
		);
		await expect(profile.update(access, { profile: "standard" })).rejects.toThrow("profile write failed");
		expect(await profile.getPolicy()).toBe("shortlived");
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("does not report success or audit an update when the migration row is absent", async () => {
		await state.db("setting").delete();
		await expect(profile.update(access, { profile: "standard" })).rejects.toMatchObject({ status: 404 });
		expect(await state.db("setting")).toEqual([]);
		expect(state.audit).not.toHaveBeenCalled();
	});
});
