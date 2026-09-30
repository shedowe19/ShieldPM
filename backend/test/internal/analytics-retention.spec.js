import dayjs from "dayjs";
import knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	settingQuery: vi.fn(),
	detailedQuery: vi.fn(),
	aggregateQuery: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	deletions: [],
}));
vi.mock("../../models/setting.js", async () => {
	const { Model } = await import("objection");
	class Setting extends Model {
		static get tableName() {
			return "setting";
		}
		static get jsonAttributes() {
			return ["meta"];
		}
	}
	return { default: { query: (...args) => state.settingQuery(...args) || Setting.query(state.db) } };
});
vi.mock("../../models/analytics_logs.js", async () => {
	const { Model } = await import("objection");
	class DetailedLogs extends Model {
		static get tableName() {
			return "analytics_logs";
		}
	}
	return { default: { query: (...args) => state.detailedQuery(...args) || DetailedLogs.query(state.db) } };
});
vi.mock("../../models/analytic_count.js", async () => {
	const { Model } = await import("objection");
	class Aggregates extends Model {
		static get tableName() {
			return "analytic_count";
		}
	}
	return { default: { query: (...args) => state.aggregateQuery(...args) || Aggregates.query(state.db) } };
});
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../logger.js", () => ({ analytics: { info: state.info, error: state.error } }));

import { AnalyticsService } from "../../internal/analytics.js";
import retentionOptions from "../../internal/analytics-options.js";
import errs from "../../lib/error.js";

const policy = { detailed_retention_hours: 24, aggregation_retention_days: 35 };
const savePolicy = (meta) =>
	state
		.db("setting")
		.where({ id: "analytics-options" })
		.update({ meta: JSON.stringify(meta) });
const seedRetainedRows = async () => {
	await state.db("analytics_logs").insert([
		{ id: 1, time: "2026-09-29T11:59:59.999Z" },
		{ id: 2, time: "2026-09-29T12:00:00.000Z" },
		{ id: 3, time: "2026-09-29T12:00:00.001Z" },
	]);
	await state.db("analytic_count").insert([
		{ id: 1, timestamp: "2026-08-26T11:59:59.999Z" },
		{ id: 2, timestamp: "2026-08-26T12:00:00.000Z" },
		{ id: 3, timestamp: "2026-08-26T12:00:00.001Z" },
	]);
};

describe("database-controlled analytics retention", () => {
	let service;
	let policyRead;
	beforeEach(async () => {
		vi.resetAllMocks();
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-09-30T12:00:00.000Z"));
		state.deletions = [];
		state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
		state.db.on("query", (query) => {
			if (query.sql.startsWith("delete") && /analytics_logs|analytic_count/.test(query.sql)) {
				state.deletions.push({ sql: query.sql, bindings: query.bindings });
			}
		});
		await state.db.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.string("value");
			table.text("meta");
		});
		await state.db.schema.createTable("analytics_logs", (table) => {
			table.integer("id").primary();
			table.string("time");
		});
		await state.db.schema.createTable("analytic_count", (table) => {
			table.integer("id").primary();
			table.string("timestamp");
		});
		await state
			.db("setting")
			.insert({ id: "analytics-options", value: "configured", meta: JSON.stringify(policy) });
		policyRead = vi.spyOn(retentionOptions, "getPolicy");
		service = new AnalyticsService();
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.useRealTimers();
		await state.db.destroy();
	});

	it("deletes only rows strictly older than each cutoff using one saved policy snapshot", async () => {
		await seedRetainedRows();
		await service.runRetention();
		expect(policyRead).toHaveBeenCalledOnce();
		expect(state.settingQuery).toHaveBeenCalledOnce();
		expect(await state.db("analytics_logs").select("id")).toEqual([{ id: 2 }, { id: 3 }]);
		expect(await state.db("analytic_count").select("id")).toEqual([{ id: 2 }, { id: 3 }]);
		expect(state.deletions.map((query) => query.bindings)).toEqual([
			["2026-09-29T12:00:00.000Z"],
			["2026-08-26T12:00:00.000Z"],
		]);
	});

	it("uses a newly saved policy on the next cleanup without deleting while settings are saved", async () => {
		await seedRetainedRows();
		await service.runRetention();
		const access = { can: vi.fn() };
		await retentionOptions.update(access, { detailed_retention_hours: 1, aggregation_retention_days: 1 });
		expect(await state.db("analytics_logs").select("id")).toHaveLength(2);
		expect(await state.db("analytic_count").select("id")).toHaveLength(2);
		expect(state.deletions).toHaveLength(2);
		await service.runRetention();
		expect(policyRead).toHaveBeenCalledTimes(2);
		expect(await state.db("analytics_logs")).toEqual([]);
		expect(await state.db("analytic_count")).toEqual([]);
		expect(state.deletions.slice(2).map((query) => query.bindings)).toEqual([
			["2026-09-30T11:00:00.000Z"],
			["2026-09-29T12:00:00.000Z"],
		]);
	});

	it("captures one clock for both cutoffs even if the system clock changes between calculations", async () => {
		const subtract = dayjs.prototype.subtract;
		vi.spyOn(dayjs.prototype, "subtract").mockImplementation(function (amount, unit) {
			const result = subtract.call(this, amount, unit);
			if (unit === "hour") vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
			return result;
		});
		await service.runRetention();
		expect(state.deletions.map((query) => query.bindings)).toEqual([
			["2026-09-29T12:00:00.000Z"],
			["2026-08-26T12:00:00.000Z"],
		]);
	});

	it.each([
		["1", "1"],
		["invalid", "-1"],
		[String(Number.MAX_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER)],
	])("ignores removed retention environment controls %s / %s", async (hours, days) => {
		vi.stubEnv("ANALYTICS_DETAILED_RETENTION_HOURS", hours);
		vi.stubEnv("ANALYTICS_AGGREGATION_RETENTION_DAYS", days);
		await service.runRetention();
		expect(state.deletions.map((query) => query.bindings)).toEqual([
			["2026-09-29T12:00:00.000Z"],
			["2026-08-26T12:00:00.000Z"],
		]);
	});

	it.each([
		{ ...policy, detailed_retention_hours: Number.MAX_SAFE_INTEGER },
		{ ...policy, aggregation_retention_days: Number.MAX_SAFE_INTEGER },
		{ ...policy, detailed_retention_hours: 2_147_483_647 },
		{ ...policy, aggregation_retention_days: 2_147_483_647 },
		{ ...policy, detailed_retention_hours: 18_000_000 },
		{ ...policy, aggregation_retention_days: 740_000 },
	])("preserves both tables for a safe integer policy with unusable calendar cutoffs: %j", async (savedPolicy) => {
		await seedRetainedRows();
		await savePolicy(savedPolicy);
		const serialization = vi.spyOn(dayjs.prototype, "toISOString");
		await service.runRetention();
		expect(state.detailedQuery).not.toHaveBeenCalled();
		expect(state.aggregateQuery).not.toHaveBeenCalled();
		expect(state.deletions).toEqual([]);
		expect(serialization).not.toHaveBeenCalled();
		expect(await state.db("analytics_logs")).toHaveLength(3);
		expect(await state.db("analytic_count")).toHaveLength(3);
		expect(state.error).toHaveBeenCalledExactlyOnceWith(
			"Failed to run retention: Analytics retention policy produces invalid date cutoffs; no rows were deleted",
		);
	});

	it("accepts large representable periods without imposing an arbitrary shorter limit", async () => {
		await savePolicy({ detailed_retention_hours: 1_000_000, aggregation_retention_days: 100_000 });
		await seedRetainedRows();
		await service.runRetention();
		expect(state.deletions).toHaveLength(2);
		expect(state.error).not.toHaveBeenCalled();
		expect(await state.db("analytics_logs")).toHaveLength(3);
		expect(await state.db("analytic_count")).toHaveLength(3);
	});

	it.each([
		{ ...policy, detailed_retention_hours: 0 },
		{ ...policy, aggregation_retention_days: "35" },
		{ detailed_retention_hours: 24 },
	])("fails closed for corrupt saved policy %j", async (savedPolicy) => {
		await seedRetainedRows();
		await savePolicy(savedPolicy);
		await service.runRetention();
		expect(state.deletions).toEqual([]);
		expect(state.error).toHaveBeenCalledExactlyOnceWith(
			"Failed to run retention: The saved analytics options are invalid",
		);
		expect(await state.db("analytics_logs")).toHaveLength(3);
		expect(await state.db("analytic_count")).toHaveLength(3);
	});

	it("preserves rows and cached summaries if loading policy fails and allows a later successful cleanup", async () => {
		await seedRetainedRows();
		service.summaryCache.set("cached", { value: "prior summary" });
		policyRead.mockRejectedValueOnce(new errs.ConfigurationError("Policy could not be loaded"));
		await service.runRetention();
		expect(state.deletions).toEqual([]);
		expect(service.summaryCache.size).toBe(1);
		expect(service.retentionPromise).toBeNull();
		expect(state.error).toHaveBeenCalledExactlyOnceWith("Failed to run retention: Policy could not be loaded");
		await service.runRetention();
		expect(state.deletions).toHaveLength(2);
		expect(service.summaryCache.size).toBe(0);
	});

	it("preserves both tables if the saved analytics options row is missing", async () => {
		await seedRetainedRows();
		await state.db("setting").where({ id: "analytics-options" }).delete();
		await service.runRetention();
		expect(state.deletions).toEqual([]);
		expect(state.detailedQuery).not.toHaveBeenCalled();
		expect(state.aggregateQuery).not.toHaveBeenCalled();
		expect(state.error).toHaveBeenCalledOnce();
		expect(await state.db("analytics_logs")).toHaveLength(3);
		expect(await state.db("analytic_count")).toHaveLength(3);
	});

	it("does not start overlapping cleanup or load another snapshot while policy lookup is pending", async () => {
		let resolvePolicy;
		policyRead.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolvePolicy = resolve;
				}),
		);
		const first = service.runRetention();
		const second = service.runRetention();
		expect(policyRead).toHaveBeenCalledOnce();
		expect(state.deletions).toEqual([]);
		resolvePolicy(policy);
		await Promise.all([first, second]);
		expect(state.deletions).toHaveLength(2);
		expect(service.retentionPromise).toBeNull();
	});

	it("keeps the cleanup lock until both deletes finish and preserves the cache when neither deletes rows", async () => {
		let finishDetailed;
		const deletion = new Promise((resolve) => {
			finishDetailed = resolve;
		});
		state.detailedQuery.mockReturnValueOnce({ where: () => ({ delete: () => deletion }) });
		service.summaryCache.set("cached", { value: "current summary" });
		const first = service.runRetention();
		await vi.waitFor(() => expect(state.detailedQuery).toHaveBeenCalledOnce());
		const second = service.runRetention();
		expect(policyRead).toHaveBeenCalledOnce();
		finishDetailed(0);
		await Promise.all([first, second]);
		expect(state.aggregateQuery).toHaveBeenCalledOnce();
		expect(service.summaryCache.size).toBe(1);
		expect(service.retentionPromise).toBeNull();
	});

	it("invalidates cached summaries after a successful deletion even if the other table fails", async () => {
		await seedRetainedRows();
		await state.db.raw(
			"CREATE TRIGGER reject_aggregate_cleanup BEFORE DELETE ON analytic_count BEGIN SELECT RAISE(ABORT, 'aggregate cleanup failed'); END",
		);
		service.summaryCache.set("cached", { value: "prior summary" });
		await service.runRetention();
		expect(await state.db("analytics_logs")).toHaveLength(2);
		expect(await state.db("analytic_count")).toHaveLength(3);
		expect(service.summaryCache.size).toBe(0);
		expect(service.retentionPromise).toBeNull();
		expect(state.error.mock.calls.flat().join(" ")).toContain("aggregate cleanup failed");
	});

	it("awaits an unfinished delete before releasing the lock after the other delete fails", async () => {
		let finishAggregate;
		const aggregateDeletion = new Promise((resolve) => {
			finishAggregate = resolve;
		});
		state.detailedQuery.mockReturnValueOnce({
			where: () => ({
				delete: async () => {
					throw new Error("detailed cleanup failed");
				},
			}),
		});
		state.aggregateQuery.mockReturnValueOnce({ where: () => ({ delete: () => aggregateDeletion }) });
		let finished = false;
		const first = service.runRetention().then(() => {
			finished = true;
		});
		await vi.waitFor(() => expect(state.aggregateQuery).toHaveBeenCalledOnce());
		const overlapping = service.runRetention();
		expect(policyRead).toHaveBeenCalledOnce();
		expect(finished).toBe(false);
		expect(state.error).not.toHaveBeenCalled();
		finishAggregate(0);
		await Promise.all([first, overlapping]);
		expect(finished).toBe(true);
		expect(service.retentionPromise).toBeNull();
		expect(state.error).toHaveBeenCalledExactlyOnceWith("Failed to run retention: detailed cleanup failed");
	});
});
