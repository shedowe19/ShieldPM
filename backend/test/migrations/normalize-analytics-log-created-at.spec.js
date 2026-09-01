import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20260901000000_normalize_analytics_log_created_at.js";

describe("normalize analytics log created_at migration", () => {
	let knex;

	beforeEach(async () => {
		knex = Knex({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		await knex.schema.createTable("analytics_logs", (table) => {
			table.increments("id").primary();
			table.bigInteger("created_at").nullable().defaultTo(knex.fn.now());
		});
		await knex("analytics_logs").insert([
			{ id: 1, created_at: "2025-12-30 20:00:01" },
			{ id: 2, created_at: 1_788_200_402_345 },
			{ id: 3, created_at: "not-a-timestamp" },
			{ id: 4, created_at: null },
			{ id: 5, created_at: "0" },
			{ id: 6, created_at: "2026-02-31 20:00:01" },
			{ id: 7, created_at: "1234-01-01 00:00:00" },
		]);
	});

	afterEach(async () => {
		await knex.destroy();
	});

	it("backfills parseable legacy text while preserving integers and exceptional values", async () => {
		await up(knex);
		await up(knex);

		const rows = await knex("analytics_logs")
			.select("id", "created_at")
			.select(knex.raw("typeof(created_at) AS created_at_type"))
			.orderBy("id");

		expect(rows).toEqual([
			{ id: 1, created_at: Date.parse("2025-12-30T20:00:01.000Z"), created_at_type: "integer" },
			{ id: 2, created_at: 1_788_200_402_345, created_at_type: "integer" },
			{ id: 3, created_at: "not-a-timestamp", created_at_type: "text" },
			{ id: 4, created_at: null, created_at_type: "null" },
			{ id: 5, created_at: 0, created_at_type: "integer" },
			{ id: 6, created_at: "2026-02-31 20:00:01", created_at_type: "text" },
			{ id: 7, created_at: "1234-01-01 00:00:00", created_at_type: "text" },
		]);

		await expect(down(knex)).resolves.toBeUndefined();
	});

	it("is safe when the legacy table is absent", async () => {
		await knex.schema.dropTable("analytics_logs");
		await expect(up(knex)).resolves.toBeUndefined();
	});
});
