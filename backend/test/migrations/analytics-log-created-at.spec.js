import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

import { up as createAnalyticsLogs } from "../../migrations/20251231000000_analytics_logs.js";
import { down, up } from "../../migrations/20260907000000_fix_analytics_log_created_at.js";

let directory;
let knex;
beforeEach(() => {
	directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-log-timestamps-"));
	knex = Knex({
		client: "better-sqlite3",
		connection: { filename: join(directory, "database.sqlite") },
		useNullAsDefault: true,
	});
});
afterEach(async () => {
	await knex.destroy();
	fs.rmSync(directory, { recursive: true, force: true });
});

describe("analytics created_at schema", () => {
	it("repairs legacy timestamp text and default while preserving numeric epochs, log content and indexes", async () => {
		await knex.schema.createTable("analytics_logs", (table) => {
			table.increments("id");
			table.string("time");
			table.string("path");
			table.bigInteger("created_at").defaultTo(knex.fn.now());
			table.index("created_at");
		});
		const date = "2026-09-07T12:34:56.000Z";
		const milliseconds = Date.parse(date);
		await knex("analytics_logs").insert([
			{ id: 1, time: date, path: "/legacy", created_at: "2026-09-07 12:34:56" },
			{ id: 2, time: date, path: "/numeric", created_at: milliseconds + 123 },
		]);
		await up(knex);
		expect(await knex("analytics_logs").orderBy("id")).toEqual([
			{ id: 1, time: date, path: "/legacy", created_at: milliseconds },
			{ id: 2, time: date, path: "/numeric", created_at: milliseconds + 123 },
		]);
		await knex("analytics_logs").insert({ time: date, path: "/new" });
		expect(await knex("analytics_logs").where("path", "/new").first()).toMatchObject({ created_at: 0 });
		expect(
			(await knex.raw("PRAGMA index_list('analytics_logs')")).some((index) => index.name.includes("created_at")),
		).toBe(true);
		await down(knex);
		expect((await knex("analytics_logs").columnInfo()).created_at.defaultValue).toBe("'0'");
	});

	it("creates a PostgreSQL-compatible bigint default for clean installations", async () => {
		const postgres = Knex({ client: "pg" });
		try {
			const statements = createAnalyticsLogs(postgres).toSQL();
			const create = statements.find((statement) => statement.sql.startsWith("create table"));
			expect(create.sql).toContain("\"created_at\" bigint default '0'");
			expect(create.sql).not.toContain("CURRENT_TIMESTAMP");
		} finally {
			await postgres.destroy();
		}
	});
});
