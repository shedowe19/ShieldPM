import knex from "knex";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null }));
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, isPostgres: () => false }));
vi.mock("../../models/audit-log.js", async () => {
	const { Model } = await import("objection");
	class AuditLog extends Model {
		static get tableName() {
			return "audit_log";
		}
	}
	return { default: { query: () => AuditLog.query(state.database) } };
});

import auditLog from "../../internal/audit-log.js";

describe("audit date range against stored SQLite timestamps", () => {
	beforeAll(async () => {
		state.database = knex({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		await state.database.schema.createTable("audit_log", (table) => {
			table.increments("id");
			table.text("created_on");
		});
		for (const hour of [7, 8, 9, 10, 11]) {
			await state.database("audit_log").insert({
				created_on: state.database.raw("datetime(?, 'localtime')", [
					`2026-07-12T${String(hour).padStart(2, "0")}:00:00.000Z`,
				]),
			});
		}
	});
	afterAll(async () => state.database.destroy());
	it("includes exact UTC boundaries despite the space-separated local database format", async () => {
		const rows = await auditLog.getAll({ can: vi.fn() }, undefined, undefined, {
			created_after: "2026-07-12T08:00:00.000Z",
			created_before: "2026-07-12T10:00:00.000Z",
		});
		expect(rows.map((row) => row.id)).toEqual([4, 3, 2]);
	});
});
