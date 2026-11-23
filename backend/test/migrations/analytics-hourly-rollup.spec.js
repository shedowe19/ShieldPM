import knex from "knex";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { down, up } from "../../migrations/20261123000002_add_analytics_hourly_rollup.js";
import { createPostgres } from "../helpers/postgres.js";

vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

const indexNames = async (db, table) => {
	if (db.client.config.client === "pg") {
		const result = await db.raw(
			"SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ?",
			[table],
		);
		return result.rows.map((row) => row.indexname);
	}
	const rows = await db.raw(`PRAGMA index_list('${table}')`);
	return rows.map((row) => row.name);
};

describe.each(["sqlite", "postgres"])("hourly analytics rollup migration on %s", (engine) => {
	let db;
	let embedded;

	beforeAll(async () => {
		if (engine === "postgres") {
			embedded = await createPostgres();
			db = embedded.database;
		} else {
			db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		}
		await db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.string("domain_names");
		});
		await db.schema.createTable("analytics_logs", (table) => {
			table.increments("id");
			table.integer("host_id").notNullable();
			table.string("time");
			table.integer("status");
			table.integer("bytes");
		});
		await db("proxy_host").insert({ domain_names: "[]", id: 1 });
	});

	afterAll(async () => {
		if (embedded) await embedded.close();
		else await db.destroy();
	});

	it("creates the hourly and rollup-state tables with a portable unique bucket key", async () => {
		await up(db);

		expect(await db.schema.hasTable("analytics_hourly")).toBe(true);
		expect(await db.schema.hasTable("analytics_rollup_state")).toBe(true);
		expect(await db.schema.hasColumn("analytics_hourly", "bucket_key")).toBe(true);
		expect(await db.schema.hasColumn("analytics_hourly", "bucket_start")).toBe(true);
		expect(await db.schema.hasColumn("analytics_hourly", "rolled_up_at")).toBe(true);
		expect(await db.schema.hasColumn("analytics_rollup_state", "watermark")).toBe(true);
		expect(await db.schema.hasColumn("analytics_rollup_state", "coverage_start")).toBe(true);
		expect(await indexNames(db, "analytics_logs")).toContain("analytics_logs_time_index");
	});

	it("allows one global and one host row per hour but rejects a duplicate bucket", async () => {
		const row = { bucket_start: "2026-11-23T10:00:00.000Z", request_count: 1 };
		await db("analytics_hourly").insert([
			{ ...row, bucket_key: "global" },
			{ ...row, bucket_key: "host:7", proxy_host_id: 1 },
		]);
		await expect(db("analytics_hourly").insert({ ...row, bucket_key: "global" })).rejects.toThrow();

		await db("analytics_rollup_state").insert({ name: "hourly", watermark: row.bucket_start });
		await expect(db("analytics_rollup_state").insert({ name: "hourly" })).rejects.toThrow();
	});

	it("is idempotent when the migration is retried", async () => {
		await expect(up(db)).resolves.toBeUndefined();
	});

	it("drops the rollup tables and the detail time index on rollback", async () => {
		await down(db);

		expect(await db.schema.hasTable("analytics_hourly")).toBe(false);
		expect(await db.schema.hasTable("analytics_rollup_state")).toBe(false);
		expect(await indexNames(db, "analytics_logs")).not.toContain("analytics_logs_time_index");
	});
});
