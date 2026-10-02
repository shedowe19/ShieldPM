import fs from "node:fs";
import path from "node:path";
import knex from "knex";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decrypt } from "../../lib/encryption.js";
import { createPostgres } from "../helpers/postgres.js";
import { backendSourcePath } from "../helpers/source-path.js";

vi.mock("../../internal/nginx.js", () => ({
	default: {
		deleteConfig: vi.fn().mockResolvedValue(true),
		generateConfig: vi.fn().mockResolvedValue(true),
		test: vi.fn().mockResolvedValue(true),
		reload: vi.fn().mockResolvedValue(true),
	},
}));
vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "ab".repeat(32) }));

afterEach(() => vi.unstubAllEnvs());

describe("complete database migration chain", () => {
	it.each(["sqlite", "postgres"])(
		"builds a fresh %s schema in one transaction",
		async (engine) => {
			const syntheticSecret = "SYNTHETIC_FULL_SCHEMA_EAB_KEY";
			vi.stubEnv("ACME_EAB_HMAC_KEY", syntheticSecret);
			vi.stubEnv("ACME_EAB_KID", "synthetic-kid");
			vi.stubEnv("ACME_EMAIL", "account@example.test");
			const embedded = engine === "postgres" ? await createPostgres() : null;
			const database =
				embedded?.database ||
				knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
			try {
				await database.transaction(async (transaction) => {
					const directory = backendSourcePath("migrations");
					for (const file of fs
						.readdirSync(directory)
						.filter((name) => name.endsWith(".js"))
						.sort()) {
						const migration = await import(path.join(directory, file));
						await migration.up(transaction);
					}
				});
				expect(await database.schema.hasTable("user_2fa")).toBe(true);
				expect(await database.schema.hasColumn("proxy_host", "adv_limit_req_burst")).toBe(true);
				expect(await database.schema.hasColumn("auth_sessions", "replaced_by_session_id")).toBe(true);
				expect(await database.schema.hasColumn("proxy_host_monitor", "upstream_ca")).toBe(true);
				expect(await database.schema.hasColumn("proxy_host_monitor", "upstream_server_name")).toBe(true);
				expect(await database.schema.hasColumn("proxy_host_monitor", "skip_certificate_verification")).toBe(
					true,
				);
				const meta = (await database("setting").where("id", "ai-config").first()).meta;
				expect((typeof meta === "string" ? JSON.parse(meta) : meta).num_ctx).toBe(8192);
				const acmeProfile = await database("setting").where({ id: "acme-profile" }).first();
				expect(acmeProfile.value).toBe("standard");
				expect(acmeProfile.description).not.toMatch(/inherit|ACME_PROFILE/);
				for (const id of [
					"certificate-options",
					"ip-ranges-options",
					"analytics-options",
					"nginx-options",
					"acme-options",
				]) {
					expect(await database("setting").where({ id }).first()).toMatchObject({ id, value: "configured" });
				}
				const acmeRow = await database("setting").where({ id: "acme-options" }).first();
				const acmeMeta = typeof acmeRow.meta === "string" ? JSON.parse(acmeRow.meta) : acmeRow.meta;
				expect(acmeMeta.account_id).toBe("");
				expect(decrypt(acmeMeta.encrypted_eab_hmac_key)).toBe(syntheticSecret);
				expect(JSON.stringify(acmeRow)).not.toContain(syntheticSecret);
			} finally {
				if (embedded) await embedded.close();
				else await database.destroy();
			}
		},
		30000,
	);
});
