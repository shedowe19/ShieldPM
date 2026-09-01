import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Knex from "knex";
import { Model } from "objection";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { up as addLedger } from "../../migrations/20260831231500_add_analytics_ingestion_ledger.js";

describe("analytics SQLite ingestion transaction", () => {
	let directory;
	let knex;
	let AnalyticsService;
	let originalDataPath;

	beforeAll(async () => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-analytics-ingestion-"));
		originalDataPath = process.env.DATA_PATH;
		process.env.DATA_PATH = directory;
		({ AnalyticsService } = await import("../../internal/analytics.js"));
		knex = Knex({
			client: "better-sqlite3",
			connection: { filename: path.join(directory, "database.sqlite") },
			useNullAsDefault: true,
		});
		Model.knex(knex);
		await knex.schema.createTable("analytics_logs", (table) => {
			table.increments("id").primary();
			table.integer("host_id").notNullable();
			table.string("time").notNullable();
			table.string("method");
			table.string("path");
			table.integer("status");
			table.integer("bytes");
			table.string("ip");
			table.string("country_code");
			table.string("referer");
			table.string("user_agent");
			table.integer("duration");
			table.bigInteger("created_at").notNullable();
		});
		await knex.schema.createTable("analytic_count", (table) => {
			table.increments("id").primary();
			table.integer("proxy_host_id").nullable();
			table.string("aggregation_key", 32).notNullable();
			table.string("aggregation_timestamp", 30).notNullable();
			table.string("aggregation_generation", 32).notNullable();
			table.string("timestamp").notNullable();
			table.integer("status_code_2xx").defaultTo(0);
			table.integer("status_code_3xx").defaultTo(0);
			table.integer("status_code_4xx").defaultTo(0);
			table.integer("status_code_5xx").defaultTo(0);
			table.bigInteger("bytes_sent").defaultTo(0);
			table.integer("request_count").defaultTo(0);
			table.unique(["aggregation_key", "aggregation_timestamp", "aggregation_generation"]);
		});
		await addLedger(knex);
	});

	afterAll(async () => {
		await knex.destroy();
		if (originalDataPath === undefined) delete process.env.DATA_PATH;
		else process.env.DATA_PATH = originalDataPath;
		fs.rmSync(directory, { force: true, recursive: true });
	});

	it("commits ledger, details, and counters once for the same durable batch", async () => {
		const event = {
			host_id: 7,
			time: "2026-08-31T20:00:10.000Z",
			method: "GET",
			path: "/",
			status: 200,
			bytes: 42,
			ip: "192.0.2.1",
			country_code: "DE",
			referer: null,
			user_agent: "test",
			duration: 5,
		};
		const records = [
			{ sequence: 1, event, serialized: Buffer.from(`${JSON.stringify({ sequence: 1, event })}\n`) },
		];
		const service = new AnalyticsService("/tmp/unused", {
			spool: {},
			now: () => new Date("2026-08-31T20:01:00.000Z"),
		});
		const batch = service.buildBatch(records);

		await expect(service.commitBatch(batch)).resolves.toBe(true);
		await expect(service.commitBatch(service.buildBatch(records))).resolves.toBe(false);

		expect(await knex("analytics_logs").select("created_at").first()).toEqual({
			created_at: Date.parse("2026-08-31T20:01:00.000Z"),
		});
		expect(await knex("analytic_count").select("request_count", "bytes_sent").first()).toEqual({
			request_count: 1,
			bytes_sent: 42,
		});
		expect(await knex("analytics_ingestion_batch").select("status", "record_count").first()).toEqual({
			status: "committed",
			record_count: 1,
		});
	});

	it("rolls the ledger and detail rows back when aggregation fails", async () => {
		const event = {
			host_id: 8,
			time: "2026-08-31T20:02:10.000Z",
			method: "GET",
			path: "/failure",
			status: 500,
			bytes: 7,
			ip: "192.0.2.2",
			country_code: null,
			referer: null,
			user_agent: "test",
			duration: 10,
		};
		const records = [
			{ sequence: 2, event, serialized: Buffer.from(`${JSON.stringify({ sequence: 2, event })}\n`) },
		];
		const service = new AnalyticsService("/tmp/unused", {
			spool: {},
			now: () => new Date("2026-08-31T20:03:00.000Z"),
		});
		service.flushAggregations = async () => {
			throw new Error("forced aggregation failure");
		};

		await expect(service.commitBatch(service.buildBatch(records))).rejects.toThrow(/forced aggregation failure/);
		expect(await knex("analytics_logs").where("host_id", 8).count("* as count").first()).toEqual({ count: 0 });
		expect(await knex("analytics_ingestion_batch").where("first_sequence", 2).count("* as count").first()).toEqual({
			count: 0,
		});
	});
});
