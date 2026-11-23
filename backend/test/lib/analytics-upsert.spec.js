import knex from "knex";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertAnalyticsLogs, upsertAnalyticsRows } from "../../lib/analytics-upsert.js";
import { createPostgres } from "../helpers/postgres.js";

const counters = [
	"status_code_2xx",
	"status_code_3xx",
	"status_code_4xx",
	"status_code_5xx",
	"bytes_sent",
	"request_count",
];
const row = (id) => ({
	aggregation_key: id === 0 ? "global" : `host:${id}`,
	aggregation_timestamp: "2026-10-17T12:00:00.000Z",
	aggregation_generation: "live",
	proxy_host_id: id || null,
	timestamp: "2026-10-17T12:00:00.000Z",
	status_code_2xx: 1,
	status_code_3xx: 2,
	status_code_4xx: 3,
	status_code_5xx: 4,
	bytes_sent: 100,
	request_count: 10,
});

describe.each(["sqlite", "postgres"])("transactional analytics bulk upsert on %s", (engine) => {
	let db;
	let embedded;
	let model;
	let logModel;
	beforeAll(async () => {
		if (engine === "postgres") {
			embedded = await createPostgres();
			db = embedded.database;
		} else db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		model = { tableName: "analytic_count", transaction: (callback) => db.transaction(callback) };
		logModel = { tableName: "analytics_logs", transaction: (callback) => db.transaction(callback) };
		await db.schema.createTable("analytic_count", (table) => {
			table.increments("id");
			table.string("aggregation_key").notNullable();
			table.string("aggregation_timestamp").notNullable();
			table.string("aggregation_generation").notNullable();
			table.integer("proxy_host_id").nullable();
			table.string("timestamp");
			for (const column of counters) table.integer(column).nullable();
			table.check("request_count >= 0");
			table.unique(["aggregation_key", "aggregation_timestamp", "aggregation_generation"]);
		});
		await db.schema.createTable("analytics_logs", (table) => {
			table.increments("id");
			table.integer("host_id").notNullable();
			table.string("time");
			table.string("status");
			table.integer("bytes");
			table.string("event_key", 64).nullable();
			table.unique(["event_key"]);
		});
	});
	beforeEach(async () => {
		await db("analytic_count").delete();
		await db("analytics_logs").delete();
	});
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await db.destroy();
	});
	it("inserts each access-log event once across retries and reports only fresh rows", async () => {
		const logs = [
			{ bytes: 10, event_key: "a".repeat(64), host_id: 7, status: "200", time: "2026-11-23T10:00:00.000Z" },
			{ bytes: 20, event_key: "b".repeat(64), host_id: 7, status: "404", time: "2026-11-23T10:00:00.000Z" },
		];
		const first = await insertAnalyticsLogs(logModel, logs);
		expect(first.map((row) => row.event_key).sort()).toEqual(["a".repeat(64), "b".repeat(64)]);

		const second = await insertAnalyticsLogs(logModel, [...logs, logs[0]]);
		expect(second).toHaveLength(0);
		expect(Number((await db("analytics_logs").count("* as total").first()).total)).toBe(2);
	});
	it("deduplicates repeated event keys inside one batch before writing", async () => {
		const row = {
			bytes: 10,
			event_key: "c".repeat(64),
			host_id: 7,
			status: "200",
			time: "2026-11-23T10:00:00.000Z",
		};
		const fresh = await insertAnalyticsLogs(logModel, [row, row]);
		expect(fresh).toHaveLength(1);
		expect(Number((await db("analytics_logs").count("* as total").first()).total)).toBe(1);
	});
	it("writes 500 counters with two inserts and adds all counters on subsequent flushes", async () => {
		const statements = [];
		const collect = ({ sql }) => {
			if (/^insert/i.test(sql)) statements.push(sql);
		};
		db.on("query", collect);
		try {
			await upsertAnalyticsRows(
				model,
				Array.from({ length: 500 }, (_, id) => row(id)),
			);
		} finally {
			db.off("query", collect);
		}
		expect(statements).toHaveLength(2);
		await upsertAnalyticsRows(model, [row(0), row(7)]);
		const global = await db("analytic_count").where("aggregation_key", "global").first();
		expect(global.proxy_host_id).toBeNull();
		for (const column of counters) expect(Number(global[column])).toBe(row(0)[column] * 2);
		expect(Number((await db("analytic_count").where("aggregation_key", "host:7").first()).request_count)).toBe(20);
		expect(Number((await db("analytic_count").count("* as total").first()).total)).toBe(500);
	});
	it("coalesces duplicate keys before a PostgreSQL multirow conflict update", async () => {
		await upsertAnalyticsRows(model, [row(7), row(7), row(7)]);
		expect(Number((await db("analytic_count").first()).request_count)).toBe(30);
	});
	it("rolls every earlier chunk back on a later failure so a retry never double counts", async () => {
		await upsertAnalyticsRows(model, [row(1)]);
		await expect(
			upsertAnalyticsRows(model, [
				...Array.from({ length: 250 }, (_, id) => row(id)),
				{ ...row(250), request_count: -1 },
			]),
		).rejects.toThrow();
		const rows = await db("analytic_count");
		expect(rows).toHaveLength(1);
		expect(Number(rows[0].request_count)).toBe(10);
		await upsertAnalyticsRows(model, [row(1)]);
		expect(Number((await db("analytic_count").first()).request_count)).toBe(20);
	});
});

it("compiles additive MySQL counters using incoming VALUES rather than the PostgreSQL excluded alias", async () => {
	const sql = [];
	const client = knex({ client: "mysql2" });
	const trx = {
		client: client.client,
		raw: (...args) => client.raw(...args),
		table: (table) => ({
			insert: (rows) => ({
				onConflict: (keys) => ({
					merge: (updates) => {
						sql.push(client(table).insert(rows).onConflict(keys).merge(updates).toSQL().sql);
					},
				}),
			}),
		}),
	};
	try {
		await upsertAnalyticsRows({ tableName: "analytic_count", transaction: (callback) => callback(trx) }, [row(0)]);
		expect(sql[0]).toContain("on duplicate key update");
		expect(sql[0]).toContain("values(`request_count`)");
		expect(sql[0]).not.toContain("excluded");
	} finally {
		await client.destroy();
	}
});
