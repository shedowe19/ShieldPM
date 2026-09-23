import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import * as tlsOptions from "../../migrations/20260923000001_add_proxy_host_monitor_tls_options.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn() } }));

describe("monitor TLS settings migration", () => {
	it.each(["sqlite", "postgres"])("preserves an existing %s monitor during upgrade and rollback", async (engine) => {
		const embedded = engine === "postgres" ? await createPostgres() : null;
		const db =
			embedded?.database ||
			knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		try {
			await db.schema.createTable("proxy_host_monitor", (table) => {
				table.increments("id").primary();
				table.integer("host_id").notNullable();
			});
			await db("proxy_host_monitor").insert({ host_id: 42 });
			// PostgreSQL and MariaDB can commit one DDL statement before the next fails.
			if (engine === "postgres") {
				await db.schema.alterTable("proxy_host_monitor", (table) => {
					table.text("upstream_ca").nullable();
				});
			}
			await tlsOptions.up(db);
			expect(await db("proxy_host_monitor").where({ host_id: 42 }).first()).toMatchObject({
				upstream_ca: null,
				upstream_server_name: null,
			});
			await db("proxy_host_monitor").where({ host_id: 42 }).update({
				upstream_ca: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
				upstream_server_name: "service.internal.example",
			});
			await tlsOptions.up(db);
			expect((await db("proxy_host_monitor").where({ host_id: 42 }).first()).upstream_server_name).toBe(
				"service.internal.example",
			);
			await tlsOptions.down(db);
			expect(await db.schema.hasColumn("proxy_host_monitor", "upstream_ca")).toBe(false);
			expect(await db.schema.hasColumn("proxy_host_monitor", "upstream_server_name")).toBe(false);
			expect((await db("proxy_host_monitor").where({ host_id: 42 }).first()).host_id).toBe(42);
		} finally {
			if (embedded) await embedded.close();
			else await db.destroy();
		}
	});
});
