import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20260712000000_fix_analytic_count_aggregation_key.js";

const timestamp = "2026-07-12T18:11:00.000Z";
let databaseFile;
let knex;

const createLegacyAnalyticsTable = async () => {
	await knex.schema.createTable("analytic_count", (table) => {
		table.increments("id").primary();
		table.integer("proxy_host_id").nullable();
		table.string("timestamp").notNullable();
		table.integer("status_code_2xx").defaultTo(0);
		table.integer("status_code_3xx").defaultTo(0);
		table.integer("status_code_4xx").defaultTo(0);
		table.integer("status_code_5xx").defaultTo(0);
		table.bigInteger("bytes_sent").defaultTo(0);
		table.integer("request_count").defaultTo(0);
		table.index(["proxy_host_id", "timestamp"], "analytic_count_proxy_host_id_timestamp_index");
	});
};

beforeEach(async () => {
	databaseFile = fs.mkdtempSync(join(tmpdir(), "shieldpm-analytics-migration-"));
	knex = Knex({
		client: "better-sqlite3",
		connection: { filename: join(databaseFile, "database.sqlite") },
		useNullAsDefault: true,
	});
	await createLegacyAnalyticsTable();
});

afterEach(async () => {
	await knex.destroy();
	fs.rmSync(databaseFile, { force: true, recursive: true });
});

describe("analytic count aggregation key migration", () => {
	it("preserves legacy rows while reserving bounded unique fields for new host and global upserts", async () => {
		await knex("analytic_count").insert([
			{
				id: 0,
				proxy_host_id: 7,
				timestamp,
				status_code_2xx: 4,
				status_code_3xx: 0,
				status_code_4xx: 0,
				status_code_5xx: 1,
				bytes_sent: "9007199254740993",
				request_count: 5,
			},
			{
				proxy_host_id: 7,
				timestamp,
				status_code_2xx: 3,
				status_code_3xx: 0,
				status_code_4xx: 2,
				status_code_5xx: 0,
				bytes_sent: 40,
				request_count: 5,
			},
			{
				proxy_host_id: null,
				timestamp,
				status_code_2xx: 1,
				status_code_3xx: 0,
				status_code_4xx: 0,
				status_code_5xx: 0,
				bytes_sent: 5,
				request_count: 1,
			},
			{
				proxy_host_id: null,
				timestamp,
				status_code_2xx: 0,
				status_code_3xx: 2,
				status_code_4xx: 0,
				status_code_5xx: 0,
				bytes_sent: 25,
				request_count: 2,
			},
		]);

		await up(knex);

		const legacyRows = await knex("analytic_count")
			.select("id", "aggregation_key", "aggregation_timestamp", "aggregation_generation", "proxy_host_id")
			.orderBy("id");
		expect(legacyRows).toEqual([
			{
				id: 0,
				aggregation_key: "host:7",
				aggregation_timestamp: timestamp,
				aggregation_generation: "legacy:0",
				proxy_host_id: 7,
			},
			{
				id: 1,
				aggregation_key: "host:7",
				aggregation_timestamp: timestamp,
				aggregation_generation: "legacy:1",
				proxy_host_id: 7,
			},
			{
				id: 2,
				aggregation_key: "global",
				aggregation_timestamp: timestamp,
				aggregation_generation: "legacy:2",
				proxy_host_id: null,
			},
			{
				id: 3,
				aggregation_key: "global",
				aggregation_timestamp: timestamp,
				aggregation_generation: "legacy:3",
				proxy_host_id: null,
			},
		]);
		const preservedBytes = await knex.raw(
			"SELECT CAST(bytes_sent AS TEXT) AS bytes_sent FROM analytic_count WHERE id = 0",
		);
		expect(preservedBytes).toEqual([{ bytes_sent: "9007199254740993" }]);

		const increment = (aggregationKey, proxyHostId) =>
			knex("analytic_count")
				.insert({
					aggregation_key: aggregationKey,
					aggregation_timestamp: timestamp,
					aggregation_generation: "live",
					proxy_host_id: proxyHostId,
					timestamp,
					request_count: 1,
				})
				.onConflict(["aggregation_key", "aggregation_timestamp", "aggregation_generation"])
				.merge({ request_count: knex.raw("analytic_count.request_count + 1") });

		await increment("global", null);
		await increment("global", null);
		await increment("host:7", 7);
		await increment("host:7", 7);

		const currentRows = await knex("analytic_count")
			.select("aggregation_key", "aggregation_generation", "proxy_host_id", "request_count")
			.where("aggregation_generation", "live")
			.orderBy("aggregation_key");
		expect(currentRows).toEqual([
			{ aggregation_key: "global", aggregation_generation: "live", proxy_host_id: null, request_count: 2 },
			{ aggregation_key: "host:7", aggregation_generation: "live", proxy_host_id: 7, request_count: 2 },
		]);
	});

	it("removes only the new fields and unique constraint on rollback", async () => {
		await up(knex);
		await down(knex);

		for (const column of ["aggregation_key", "aggregation_timestamp", "aggregation_generation"]) {
			expect(await knex.schema.hasColumn("analytic_count", column)).toBe(false);
		}
		const indexes = await knex.raw("PRAGMA index_list('analytic_count')");
		expect(
			indexes.some((index) => index.name === "analytic_count_aggregation_key_timestamp_generation_unique"),
		).toBe(false);
		expect(indexes.some((index) => index.name === "analytic_count_proxy_host_id_timestamp_index")).toBe(true);
	});

	it("rolls back a partial schema when the unique index was never created", async () => {
		await knex.schema.table("analytic_count", (table) => {
			table.string("aggregation_key", 32).notNullable().defaultTo("global");
			table.string("aggregation_timestamp", 30).notNullable().defaultTo("");
			table.string("aggregation_generation", 32).notNullable().defaultTo("live");
		});

		await down(knex);

		for (const column of ["aggregation_key", "aggregation_timestamp", "aggregation_generation"]) {
			expect(await knex.schema.hasColumn("analytic_count", column)).toBe(false);
		}
	});
});
