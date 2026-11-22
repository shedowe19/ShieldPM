import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import knex from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null }));

vi.mock("../../models/analytic_count.js", () => ({ default: { tableName: "analytic_count" } }));
vi.mock("../../models/analytics_logs.js", () => ({
	default: {
		knex: () => holder.db,
		tableName: "analytics_logs",
	},
}));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));

import { AnalyticsService } from "../../internal/analytics.js";

let directory;
let db;
beforeAll(() => {
	directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-analytics-idempotency-"));
	db = knex({
		client: "better-sqlite3",
		connection: { filename: join(directory, "database.sqlite") },
		useNullAsDefault: true,
	});
	holder.db = db;
	return db.schema
		.createTable("analytics_logs", (table) => {
			table.increments("id");
			table.integer("host_id").notNullable();
			table.string("time");
			table.integer("status");
			table.integer("bytes");
			table.string("event_key", 64).nullable();
			table.unique(["event_key"]);
		})
		.createTable("analytic_count", (table) => {
			table.increments("id");
			table.string("aggregation_key").notNullable();
			table.string("aggregation_timestamp").notNullable();
			table.string("aggregation_generation").notNullable();
			table.integer("proxy_host_id").nullable();
			table.string("timestamp");
			table.integer("status_code_2xx").nullable();
			table.integer("status_code_3xx").nullable();
			table.integer("status_code_4xx").nullable();
			table.integer("status_code_5xx").nullable();
			table.bigInteger("bytes_sent").nullable();
			table.integer("request_count").nullable();
			table.unique(["aggregation_key", "aggregation_timestamp", "aggregation_generation"]);
		});
});
beforeEach(async () => {
	await db("analytics_logs").delete();
	await db("analytic_count").delete();
});
afterAll(async () => {
	await db.destroy();
	fs.rmSync(directory, { force: true, recursive: true });
});

const logRows = () => [
	{
		bytes: 10,
		event_key: "a".repeat(64),
		host_id: 7,
		status: 200,
		time: "2026-11-23T10:00:00.000Z",
	},
	{
		bytes: 20,
		event_key: "b".repeat(64),
		host_id: 7,
		status: 404,
		time: "2026-11-23T10:00:30.000Z",
	},
];

describe("analytics flush idempotency", () => {
	it("keeps detail rows and aggregate sums unchanged when the same batch is imported twice", async () => {
		const service = new AnalyticsService();
		const batch = logRows();

		await service.flushBatch(batch, []);
		const firstCount = await db("analytic_count").first();
		const firstDetails = Number((await db("analytics_logs").count("* as total").first()).total);

		await service.flushBatch(batch, []);
		const secondCount = await db("analytic_count").first();
		const secondDetails = Number((await db("analytics_logs").count("* as total").first()).total);

		expect(firstDetails).toBe(2);
		expect(secondDetails).toBe(2);
		expect(Number(secondCount.request_count)).toBe(Number(firstCount.request_count));
		expect(Number(secondCount.bytes_sent)).toBe(Number(firstCount.bytes_sent));
		expect(Number(secondCount.status_code_2xx)).toBe(Number(firstCount.status_code_2xx));
		expect(Number(secondCount.status_code_4xx)).toBe(Number(firstCount.status_code_4xx));
	});

	it("adds only events that were not stored by an earlier flush", async () => {
		const service = new AnalyticsService();
		const first = logRows().slice(0, 1);
		const full = logRows();

		await service.flushBatch(first, []);
		await service.flushBatch(full, []);

		const totals = await db("analytic_count").first();
		expect(Number(totals.request_count)).toBe(2);
		expect(Number(totals.bytes_sent)).toBe(30);
		expect(Number(totals.status_code_2xx)).toBe(1);
		expect(Number(totals.status_code_4xx)).toBe(1);
	});
});
