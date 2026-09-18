import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import * as redirect from "../../migrations/20251111090000_redirect_auto_scheme.js";
import * as limits from "../../migrations/20260102000000_add_req_limit.js";
import * as mtls from "../../migrations/20260105000000_add_access_list_mtls.js";
import * as domains from "../../migrations/20260222000000_normalize_domain_names.js";
import * as zstd from "../../migrations/20260918000000_add_proxy_host_zstd_compression.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));
const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);

describe("migration data preservation", () => {
	it.each(["sqlite", "postgres"])(
		"preserves values and awaits schema changes in %s",
		async (engine) => {
			const embedded = engine === "postgres" ? await createPostgres() : null;
			const database =
				embedded?.database ||
				knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
			try {
				await database.transaction(async (db) => {
					await db.schema.createTable("redirection_host", (table) => {
						table.increments("id");
						table.string("forward_scheme").notNullable().defaultTo("$scheme");
					});
					await db("redirection_host").insert([{ forward_scheme: "$scheme" }, { forward_scheme: "https" }]);
					await redirect.up(db);
					expect(await db("redirection_host").orderBy("id").pluck("forward_scheme")).toEqual([
						"auto",
						"https",
					]);
					await redirect.down(db);
					expect(await db("redirection_host").orderBy("id").pluck("forward_scheme")).toEqual([
						"$scheme",
						"https",
					]);

					await db.schema.createTable("proxy_host", (table) => {
						table.increments("id");
						table.json("domain_names");
					});
					await limits.up(db);
					await limits.down(db);
					for (const column of ["adv_limit_req_rate", "adv_limit_req_unit", "adv_limit_req_burst"])
						expect(await db.schema.hasColumn("proxy_host", column)).toBe(false);
					await db("proxy_host").insert({ id: 1, domain_names: JSON.stringify(["old.example.test"]) });
					await domains.up(db);
					await db("host_domain").where("proxy_host_id", 1).update({ domain_name: "renamed.example.test" });
					await db("proxy_host").insert({ id: 2, domain_names: JSON.stringify([]) });
					await db("host_domain").insert({ proxy_host_id: 2, domain_name: "new.example.test" });
					await domains.down(db);
					expect((await db("proxy_host").orderBy("id").pluck("domain_names")).map(json)).toEqual([
						["renamed.example.test"],
						["new.example.test"],
					]);

					await zstd.up(db);
					// A failed previous migration may have created the column before Knex recorded it.
					// Retrying must therefore complete rather than fail with a duplicate-column error.
					await zstd.up(db);
					expect((await db("proxy_host").orderBy("id").pluck("zstd_enabled")).map(Number)).toEqual([0, 0]);
					await db("proxy_host").where("id", 1).update({ zstd_enabled: true });
					expect(Number((await db("proxy_host").where("id", 1).first()).zstd_enabled)).toBe(1);
					await zstd.down(db);
					expect(await db.schema.hasColumn("proxy_host", "zstd_enabled")).toBe(false);

					await db.schema.createTable("access_list", (table) => {
						table.increments("id");
						table.json("meta");
					});
					await db("access_list").insert({
						meta: JSON.stringify({
							mtls_enabled: true,
							mtls_certificate: "original CA",
							unrelated: "preserved",
						}),
					});
					await mtls.up(db);
					const migrated = await db("access_list").first();
					expect(Boolean(migrated.mtls_enabled)).toBe(true);
					expect(migrated.mtls_certificate).toBe("original CA");
					expect(json(migrated.meta)).toEqual({ unrelated: "preserved" });
					await db("access_list").update({ mtls_enabled: false, mtls_certificate: "updated CA" });
					if (engine === "sqlite")
						await db("access_list").insert({
							meta: "{invalid",
							mtls_enabled: true,
							mtls_certificate: "retained CA",
						});
					await mtls.down(db);
					expect(json((await db("access_list").first()).meta)).toEqual({
						unrelated: "preserved",
						mtls_enabled: false,
						mtls_certificate: "updated CA",
					});
					if (engine === "sqlite")
						expect(json((await db("access_list").where("id", 2).first()).meta)).toEqual({
							mtls_enabled: true,
							mtls_certificate: "retained CA",
						});
				});
			} finally {
				if (embedded) await embedded.close();
				else await database.destroy();
			}
		},
		30000,
	);
});
