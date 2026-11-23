import knex from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AnalyticsRollupService } from "../../internal/analytics-rollup.js";
import { createPostgres } from "../helpers/postgres.js";

const NOW = new Date("2026-11-23T12:05:00.000Z");

const row = (hostId, time, status = 200, bytes = 10, duration = 5, createdAt = NOW.getTime() - 60 * 60 * 1000) => ({
	bytes,
	created_at: createdAt,
	duration,
	host_id: hostId,
	status,
	time,
});

describe("hourly rollup MySQL portability", () => {
	it("compiles the bucket upsert with set semantics instead of additive counters", async () => {
		const client = knex({ client: "mysql2" });
		try {
			const sql = client("analytics_hourly")
				.insert([{ bucket_key: "host:7", bucket_start: "2026-11-23T10:00:00.000Z", request_count: 2 }])
				.onConflict(["bucket_key", "bucket_start"])
				.merge()
				.toSQL().sql;
			expect(sql).toContain("on duplicate key update");
			expect(sql).toContain("values(`request_count`)");
			expect(sql).not.toContain("excluded");
		} finally {
			await client.destroy();
		}
	});
});

describe.each(["sqlite", "postgres"])("hourly analytics rollup on %s", (engine) => {
	let db;
	let embedded;

	beforeAll(async () => {
		if (engine === "postgres") {
			embedded = await createPostgres();
			db = embedded.database;
		} else {
			db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		}

		await db.schema.createTable("analytics_logs", (table) => {
			table.increments("id");
			table.integer("host_id").notNullable();
			table.string("time");
			table.integer("status").nullable();
			table.integer("bytes").nullable();
			table.integer("duration").nullable();
			table.bigInteger("created_at").notNullable().defaultTo(0);
		});
		await db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.string("domain_names");
		});
		await db("proxy_host").insert({ domain_names: "[]", id: 7 });
		await db.schema.createTable("analytics_hourly", (table) => {
			table.increments("id");
			table.integer("proxy_host_id").nullable();
			table.string("bucket_key").notNullable();
			table.string("bucket_start").notNullable();
			table.integer("request_count").notNullable().defaultTo(0);
			table.bigInteger("bytes_sent").notNullable().defaultTo(0);
			table.integer("status_code_2xx").notNullable().defaultTo(0);
			table.integer("status_code_3xx").notNullable().defaultTo(0);
			table.integer("status_code_4xx").notNullable().defaultTo(0);
			table.integer("status_code_5xx").notNullable().defaultTo(0);
			table.bigInteger("duration_sum").notNullable().defaultTo(0);
			table.integer("duration_count").notNullable().defaultTo(0);
			table.bigInteger("rolled_up_at").notNullable().defaultTo(0);
			table.unique(["bucket_key", "bucket_start"]);
		});
		await db.schema.createTable("analytics_rollup_state", (table) => {
			table.increments("id");
			table.string("name").notNullable().unique();
			table.string("coverage_start").nullable();
			table.string("watermark").nullable();
			table.bigInteger("last_run_at").notNullable().defaultTo(0);
			table.bigInteger("updated_at").notNullable().defaultTo(0);
		});
	});

	beforeEach(async () => {
		await db("analytics_logs").delete();
		await db("analytics_hourly").delete();
		await db("analytics_rollup_state").delete();
	});

	afterAll(async () => {
		if (embedded) await embedded.close();
		else await db.destroy();
	});

	const service = () =>
		new AnalyticsRollupService({
			graceMs: 0,
			hourlyModel: { knex: () => db },
			lateWindowHours: 3,
		});

	const bucket = (hostKey, start) =>
		db("analytics_hourly").where({ bucket_key: hostKey, bucket_start: start }).first();
	const total = async (start) =>
		Number((await db("analytics_hourly").where("bucket_start", start).sum("request_count as total").first()).total);

	it("puts rows in the correct completed hour and excludes the current hour", async () => {
		await db("analytics_logs").insert([
			row(7, "2026-11-23T09:59:59.999Z"),
			row(7, "2026-11-23T10:00:00.000Z"),
			row(7, "2026-11-23T10:30:00.000Z"),
			row(0, "2026-11-23T10:59:59.999Z"),
			row(7, "2026-11-23T11:00:00.000Z"),
			row(7, "2026-11-23T11:59:59.999Z"),
			row(7, "2026-11-23T12:00:00.000Z"),
		]);

		await service().runOnce({ now: NOW });

		expect(Number((await bucket("host:7", "2026-11-23T09:00:00.000Z")).request_count)).toBe(1);
		expect(Number((await bucket("host:7", "2026-11-23T10:00:00.000Z")).request_count)).toBe(2);
		expect(Number((await bucket("global", "2026-11-23T10:00:00.000Z")).request_count)).toBe(1);
		expect(await bucket("host:7", "2026-11-23T12:00:00.000Z")).toBeUndefined();

		const state = await db("analytics_rollup_state").where("name", "hourly").first();
		expect(state.watermark).toBe("2026-11-23T11:00:00.000Z");
		expect(state.coverage_start).toBe("2026-11-23T09:00:00.000Z");
	});

	it("does not double count when the same hour is rolled up again after a restart", async () => {
		await db("analytics_logs").insert([
			row(7, "2026-11-23T10:00:00.000Z", 200, 10),
			row(7, "2026-11-23T10:00:01.000Z", 404, 20),
			row(7, "2026-11-23T11:00:00.000Z", 200, 30),
		]);

		const first = service();
		await first.runOnce({ now: NOW });
		const firstTen = await bucket("host:7", "2026-11-23T10:00:00.000Z");

		await first.runOnce({ now: NOW });

		const restarted = service();
		await restarted.loadState();
		await restarted.runOnce({ now: NOW });
		const secondTen = await bucket("host:7", "2026-11-23T10:00:00.000Z");

		expect(Number(secondTen.request_count)).toBe(2);
		expect(Number(secondTen.bytes_sent)).toBe(30);
		expect(Number(secondTen.status_code_2xx)).toBe(1);
		expect(Number(secondTen.status_code_4xx)).toBe(1);
		expect(Number(secondTen.request_count)).toBe(Number(firstTen.request_count));
		expect(Number(secondTen.bytes_sent)).toBe(Number(firstTen.bytes_sent));
	});

	it("recomputes a committed hour when late rows arrive instead of adding them twice", async () => {
		await db("analytics_logs").insert([row(7, "2026-11-23T10:00:00.000Z"), row(7, "2026-11-23T10:00:01.000Z")]);
		const rollup = service();
		await rollup.runOnce({ now: NOW });
		expect(await total("2026-11-23T10:00:00.000Z")).toBe(2);

		await db("analytics_logs").insert(row(7, "2026-11-23T10:45:00.000Z", 200, 10, 5, NOW.getTime() + 1000));
		await rollup.runOnce({ now: new Date("2026-11-23T12:10:00.000Z") });

		expect(await total("2026-11-23T10:00:00.000Z")).toBe(3);
		expect(Number((await bucket("host:7", "2026-11-23T10:00:00.000Z")).request_count)).toBe(3);

		const state = await db("analytics_rollup_state").where("name", "hourly").first();
		expect(state.watermark).toBe("2026-11-23T11:00:00.000Z");
	});

	it("removes a stale host bucket when the replayed hour no longer contains that host", async () => {
		await db("analytics_logs").insert(row(7, "2026-11-23T10:00:00.000Z"));
		await db("analytics_hourly").insert({
			bucket_key: "host:99",
			bucket_start: "2026-11-23T10:00:00.000Z",
			proxy_host_id: 99,
			request_count: 50,
			status_code_2xx: 50,
		});

		await service().runOnce({ now: NOW });

		expect(await bucket("host:99", "2026-11-23T10:00:00.000Z")).toBeUndefined();
		expect(Number((await bucket("host:7", "2026-11-23T10:00:00.000Z")).request_count)).toBe(1);
	});

	it("attributes raw rows of a hard-deleted host to the global bucket", async () => {
		await db("analytics_logs").insert(row(99, "2026-11-23T10:00:00.000Z"));

		await service().runOnce({ now: NOW });

		expect(await bucket("host:99", "2026-11-23T10:00:00.000Z")).toBeUndefined();
		expect(Number((await bucket("global", "2026-11-23T10:00:00.000Z")).request_count)).toBe(1);
	});

	it("sums status classes, bytes and durations into the bucket", async () => {
		await db("analytics_logs").insert([
			row(7, "2026-11-23T10:00:00.000Z", 200, 100, 10),
			row(7, "2026-11-23T10:00:01.000Z", 301, 200, 20),
			row(7, "2026-11-23T10:00:02.000Z", 404, 300, 30),
			row(7, "2026-11-23T10:00:03.000Z", 503, 400, 40),
		]);

		await service().runOnce({ now: NOW });

		const stored = await bucket("host:7", "2026-11-23T10:00:00.000Z");
		expect(Number(stored.request_count)).toBe(4);
		expect(Number(stored.bytes_sent)).toBe(1000);
		expect(Number(stored.status_code_2xx)).toBe(1);
		expect(Number(stored.status_code_3xx)).toBe(1);
		expect(Number(stored.status_code_4xx)).toBe(1);
		expect(Number(stored.status_code_5xx)).toBe(1);
		expect(Number(stored.duration_sum)).toBe(100);
		expect(Number(stored.duration_count)).toBe(4);
	});
});
