import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import * as migration from "../../migrations/20261013000001_add_maintenance_pending.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn() } }));

describe("durable maintenance activation migration", () => {
	it.each(["sqlite", "postgres"])(
		"preserves existing %s hosts through upgrade, retry and rollback",
		async (engine) => {
			const embedded = engine === "postgres" ? await createPostgres() : null;
			const db =
				embedded?.database ||
				knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
			try {
				await db.schema.createTable("proxy_host", (table) => {
					table.increments("id");
					table.text("maintenance_start");
				});
				await db("proxy_host").insert({ id: 7, maintenance_start: "2026-10-13T10:00:00Z" });
				await migration.up(db);
				expect(Boolean((await db("proxy_host").first()).maintenance_pending)).toBe(false);
				await db("proxy_host").where("id", 7).update({ maintenance_pending: true });
				await migration.up(db);
				expect(Boolean((await db("proxy_host").first()).maintenance_pending)).toBe(true);
				await migration.down(db);
				await migration.down(db);
				expect(await db.schema.hasColumn("proxy_host", "maintenance_pending")).toBe(false);
				expect(await db("proxy_host").first()).toEqual({ id: 7, maintenance_start: "2026-10-13T10:00:00Z" });
			} finally {
				if (embedded) await embedded.close();
				else await db.destroy();
			}
		},
	);
});
