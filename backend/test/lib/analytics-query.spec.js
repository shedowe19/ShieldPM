import knex from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	loadAnalyticsSeries,
	planAnalyticsRange,
	resolveSeriesResolution,
	sumAnalyticsRange,
	sumAnalyticsRangeByHost,
} from "../../lib/analytics-query.js";
import { serializeAnalyticsSeries } from "../../lib/analytics-response.js";
import { createPostgres } from "../helpers/postgres.js";

describe("analytics range plan", () => {
	const start = "2026-11-20T06:30:00.000Z";
	const end = "2026-11-23T12:30:00.000Z";

	it("keeps the existing minute path for the 24-hour contract", () => {
		const plan = planAnalyticsRange({
			coveredThrough: "2026-11-23T11:00:00.000Z",
			end: "2026-11-22T12:30:00.000Z",
			start: "2026-11-21T12:30:00.000Z",
		});

		expect(plan.hourly).toBeNull();
		expect(plan.minute).toHaveLength(1);
	});

	it("splits a long range into hourly buckets and minute edges", () => {
		const plan = planAnalyticsRange({
			coveredFrom: "2026-11-20T07:00:00.000Z",
			coveredThrough: "2026-11-23T09:00:00.000Z",
			end,
			start,
		});

		expect(plan.hourly).toEqual({
			fromIso: "2026-11-20T07:00:00.000Z",
			toIso: "2026-11-23T09:00:00.000Z",
			toInclusive: false,
		});
		expect(plan.minute).toEqual([
			{ fromIso: "2026-11-20T06:30:00.000Z", toIso: "2026-11-20T07:00:00.000Z", toInclusive: false },
			{ fromIso: "2026-11-23T09:00:00.000Z", toIso: "2026-11-23T12:30:00.000Z", toInclusive: true },
		]);
	});

	it("keeps the head of a long range on minute rows until the first rolled-up hour", () => {
		const plan = planAnalyticsRange({
			coveredFrom: "2026-11-22T00:00:00.000Z",
			coveredThrough: "2026-11-23T09:00:00.000Z",
			end,
			start,
		});

		expect(plan.hourly).toEqual({
			fromIso: "2026-11-22T00:00:00.000Z",
			toIso: "2026-11-23T09:00:00.000Z",
			toInclusive: false,
		});
		expect(plan.minute[0]).toEqual({
			fromIso: "2026-11-20T06:30:00.000Z",
			toIso: "2026-11-22T00:00:00.000Z",
			toInclusive: false,
		});
	});

	it("falls back to minute rows when the rollup has no full hour in the range", () => {
		const plan = planAnalyticsRange({
			coveredFrom: "2026-11-20T06:00:00.000Z",
			coveredThrough: "2026-11-20T07:00:00.000Z",
			end,
			start,
		});
		expect(plan.hourly).toBeNull();
	});

	it("falls back to minute rows when no rollup coverage exists", () => {
		const plan = planAnalyticsRange({ coveredFrom: null, coveredThrough: null, end, start });
		expect(plan.hourly).toBeNull();
		expect(plan.minute[0]).toEqual({ fromIso: start, toIso: end, toInclusive: true });
	});

	it("downsamples long result sets to hours and days", () => {
		expect(resolveSeriesResolution(start, "2026-11-21T06:30:00.000Z")).toBe("minute");
		expect(resolveSeriesResolution(start, "2026-11-24T06:30:00.000Z")).toBe("hour");
		expect(resolveSeriesResolution(start, "2026-12-01T06:30:00.000Z")).toBe("day");
	});
});

describe.each(["sqlite", "postgres"])("analytics query switch on %s", (engine) => {
	let db;
	let embedded;

	beforeAll(async () => {
		if (engine === "postgres") {
			embedded = await createPostgres();
			db = embedded.database;
		} else {
			db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		}
		await db.schema.createTable("analytic_count", (table) => {
			table.increments("id");
			table.integer("proxy_host_id").nullable();
			table.string("timestamp");
			table.integer("request_count").nullable();
			table.bigInteger("bytes_sent").nullable();
			table.integer("status_code_2xx").nullable();
			table.integer("status_code_3xx").nullable();
			table.integer("status_code_4xx").nullable();
			table.integer("status_code_5xx").nullable();
		});
		await db.schema.createTable("analytics_hourly", (table) => {
			table.increments("id");
			table.integer("proxy_host_id").nullable();
			table.string("bucket_key");
			table.string("bucket_start");
			table.integer("request_count").nullable();
			table.bigInteger("bytes_sent").nullable();
			table.integer("status_code_2xx").nullable();
			table.integer("status_code_3xx").nullable();
			table.integer("status_code_4xx").nullable();
			table.integer("status_code_5xx").nullable();
		});
	});

	beforeEach(async () => {
		vi.stubEnv("TZ", "UTC");
		await db("analytic_count").delete();
		await db("analytics_hourly").delete();
		await db("analytics_hourly").insert([
			{
				bucket_key: "host:7",
				bucket_start: "2026-11-20T07:00:00.000Z",
				bytes_sent: 100,
				proxy_host_id: 7,
				request_count: 10,
				status_code_2xx: 8,
				status_code_3xx: 0,
				status_code_4xx: 2,
				status_code_5xx: 0,
			},
			{
				bucket_key: "host:7",
				bucket_start: "2026-11-20T08:00:00.000Z",
				bytes_sent: 50,
				proxy_host_id: 7,
				request_count: 5,
				status_code_2xx: 5,
				status_code_3xx: 0,
				status_code_4xx: 0,
				status_code_5xx: 0,
			},
			{
				bucket_key: "host:3",
				bucket_start: "2026-11-20T07:00:00.000Z",
				bytes_sent: 20,
				proxy_host_id: 3,
				request_count: 2,
				status_code_2xx: 0,
				status_code_3xx: 2,
				status_code_4xx: 0,
				status_code_5xx: 0,
			},
		]);
		await db("analytic_count").insert([
			{
				bytes_sent: 10,
				proxy_host_id: 7,
				request_count: 1,
				status_code_2xx: 1,
				timestamp: "2026-11-20T06:45:00.000Z",
			},
			// Inside the hourly window: the switch must not add minute rows twice.
			{
				bytes_sent: 1000,
				proxy_host_id: 7,
				request_count: 100,
				status_code_2xx: 100,
				timestamp: "2026-11-20T07:30:00.000Z",
			},
			{
				bytes_sent: 20,
				proxy_host_id: 7,
				request_count: 2,
				status_code_2xx: 2,
				timestamp: "2026-11-23T09:30:00.000Z",
			},
			{
				bytes_sent: 30,
				proxy_host_id: 7,
				request_count: 3,
				status_code_5xx: 3,
				timestamp: "2026-11-23T12:29:00.000Z",
			},
		]);
	});

	afterAll(async () => {
		vi.unstubAllEnvs();
		if (embedded) await embedded.close();
		else await db.destroy();
	});

	const plan = () =>
		planAnalyticsRange({
			coveredFrom: "2026-11-20T07:00:00.000Z",
			coveredThrough: "2026-11-23T09:00:00.000Z",
			end: "2026-11-23T12:30:00.000Z",
			start: "2026-11-20T06:30:00.000Z",
		});

	it("sums hourly buckets and only the minute rows outside the covered window", async () => {
		const totals = await sumAnalyticsRange(db, plan());

		expect(totals).toEqual({ bytes: 230, count: 23, s2xx: 16, s3xx: 2, s4xx: 2, s5xx: 3 });
	});

	it("keeps per-host totals separate for the top-host ranking", async () => {
		const totals = await sumAnalyticsRangeByHost(db, plan(), { excludeUnattributed: true });
		const byId = new Map(totals.map((row) => [row.id, row]));

		expect(byId.get(7)).toEqual({ bytes: 210, client_errors: 2, id: 7, requests: 21, server_errors: 3 });
		expect(byId.get(3)).toEqual({ bytes: 20, client_errors: 0, id: 3, requests: 2, server_errors: 0 });
	});

	it("returns a combined series with the same counters the chart expects", async () => {
		const rows = await loadAnalyticsSeries(db, plan());
		const series = serializeAnalyticsSeries(rows, "day");

		expect(series).toEqual([
			{ bytes: 180, count: 18, s2xx: 14, s3xx: 2, s4xx: 2, s5xx: 0, timestamp: "2026-11-20T00:00:00.000Z" },
			{ bytes: 50, count: 5, s2xx: 2, s3xx: 0, s4xx: 0, s5xx: 3, timestamp: "2026-11-23T00:00:00.000Z" },
		]);
	});
});
