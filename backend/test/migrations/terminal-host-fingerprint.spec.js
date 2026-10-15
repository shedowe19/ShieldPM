import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import * as migration from "../../migrations/20261015000001_add_terminal_host_fingerprint.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn() } }));

describe("confirmed terminal host fingerprint migration", () => {
	it.each(["sqlite", "postgres"])(
		"preserves credentials and explicit pins through %s upgrade, retry and rollback",
		async (engine) => {
			const embedded = engine === "postgres" ? await createPostgres() : null;
			const db =
				embedded?.database ||
				knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
			try {
				await db.schema.createTable("proxy_host", (table) => {
					table.increments("id");
					table.text("terminal_password");
				});
				await db("proxy_host").insert({ id: 7, terminal_password: "encrypted-fixture" });
				await migration.up(db);
				expect(await db("proxy_host").first()).toEqual({
					id: 7,
					terminal_password: "encrypted-fixture",
					terminal_host_fingerprint: null,
				});
				const pin = `SHA256:${"A".repeat(43)}`;
				await db("proxy_host").where("id", 7).update({ terminal_host_fingerprint: pin });
				await migration.up(db);
				expect((await db("proxy_host").first()).terminal_host_fingerprint).toBe(pin);
				await migration.down(db);
				await migration.down(db);
				expect(await db.schema.hasColumn("proxy_host", "terminal_host_fingerprint")).toBe(false);
				expect(await db("proxy_host").first()).toEqual({ id: 7, terminal_password: "encrypted-fixture" });
			} finally {
				if (embedded) await embedded.close();
				else await db.destroy();
			}
		},
		30_000,
	);
});
