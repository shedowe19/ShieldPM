import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite" }));
vi.mock("../../db.js", () => ({ default: () => state.db }));
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => state.engine === "sqlite",
	isPostgres: () => state.engine === "postgres",
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/chat.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));

// Set a harmless initial binding before the model modules are imported.
state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
const { default: monitor } = await import("../../internal/proxy-host-monitor.js");
const { default: Monitor } = await import("../../models/proxy_host_monitor.js");
const { default: Check } = await import("../../models/proxy_host_monitor_check.js");
const { default: Host } = await import("../../models/proxy_host.js");
await state.db.destroy();

describe("cross-engine monitor scheduling fairness", () => {
	it.each(["sqlite", "postgres"])(
		"checks NULL-due %s hosts before a permanently overdue batch",
		async (engine) => {
			const embedded = engine === "postgres" ? await createPostgres() : null;
			const db =
				embedded?.database ||
				knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
			state.engine = engine;
			for (const model of [Monitor, Check, Host]) model.knex(db);
			let run;
			try {
				await db.schema.createTable("proxy_host", (table) => {
					table.increments("id");
					table.integer("enabled");
					table.integer("is_deleted");
				});
				await db.schema.createTable("proxy_host_monitor", (table) => {
					table.integer("host_id");
					table.integer("enabled");
					table.string("next_check_at");
				});
				await db.schema.createTable("proxy_host_monitor_check", (table) => {
					table.increments("id");
					table.string("checked_at");
				});
				await db("proxy_host").insert(
					Array.from({ length: 203 }, (_, index) => ({ id: index + 1, enabled: 1, is_deleted: 0 })),
				);
				await db("proxy_host_monitor").insert(
					Array.from({ length: 203 }, (_, index) => ({
						host_id: index + 1,
						enabled: 1,
						next_check_at:
							index === 0 ? "2025-01-01T00:00:00.000Z" : index < 200 ? "2020-01-01T00:00:00.000Z" : null,
					})),
				);
				const checked = [];
				run = vi.spyOn(monitor, "run").mockImplementation(async (hostId) => {
					checked.push(hostId);
					if (hostId > 200)
						await db("proxy_host_monitor")
							.where("host_id", hostId)
							.update({ next_check_at: "2099-01-01T00:00:00Z" });
				});
				monitor.stop();
				for (let scan = 0; scan < 3; scan++) await monitor.tick();
				expect(checked.slice(0, 7)).toEqual([201, 202, 203, 2, 3, 4, 5]);
				expect(checked).toHaveLength(300);
				for (const id of [201, 202, 203]) expect(checked.filter((hostId) => hostId === id)).toHaveLength(1);
			} finally {
				run?.mockRestore();
				monitor.stop();
				if (embedded) await embedded.close();
				else await db.destroy();
			}
		},
		30_000,
	);
});
