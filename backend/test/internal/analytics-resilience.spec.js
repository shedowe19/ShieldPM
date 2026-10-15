import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hostQuery: vi.fn(), transaction: vi.fn(), query: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.hostQuery } }));
vi.mock("../../models/analytic_count.js", () => ({
	default: {
		transaction: mocks.transaction,
		query: mocks.query,
		knex: () => ({ raw: (sql, bindings) => ({ sql, bindings }) }),
	},
}));
vi.mock("../../models/analytics_logs.js", () => ({ default: {} }));

import { AnalyticsService } from "../../internal/analytics.js";

const entry = (id) => ({
	host_id: id,
	timestamp: "2026-09-01T12:00:00Z",
	count: 1,
	bytes: 20,
	status_2xx: 1,
	status_3xx: 0,
	status_4xx: 0,
	status_5xx: 0,
});

describe("analytics input and transaction resilience", () => {
	beforeEach(() => vi.clearAllMocks());
	it("ignores malformed values without crashing the log tail or modifying counters", () => {
		const service = new AnalyticsService();
		for (const line of ["null", "[]", '"text"', '{"time_iso8601":"not a date"}', "invalid JSON"]) {
			expect(() => service.processLine(line)).not.toThrow();
		}
		expect(service.aggregationBuffer.size).toBe(0);
	});
	it("loads current domain relations and attributes mixed-case host:port fallback", async () => {
		const builder = {
			where: () => builder,
			select: () => builder,
			withGraphFetched: vi.fn().mockResolvedValue([{ id: 7, domain_names: ["APP.example.test"] }]),
		};
		mocks.hostQuery.mockReturnValue(builder);
		const service = new AnalyticsService();
		await service.loadDomains();
		service.processLine(
			JSON.stringify({
				server_name: "_",
				http_host: "App.Example.Test:443",
				status: 200,
				time_iso8601: "2026-09-01T12:00:00Z",
			}),
		);
		expect(service.detailedLogBuffer[0].host_id).toBe(7);
	});
	it("bounds pending detail and aggregation buffers during a slow database write", () => {
		const service = new AnalyticsService();
		service.flushPromise = new Promise(() => {});
		for (let i = 0; i < 1200; i++) {
			service.processLine(
				JSON.stringify({ status: 200, time_iso8601: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString() }),
			);
		}
		expect(service.detailedLogBuffer).toHaveLength(1000);
		expect(service.aggregationBuffer.size).toBe(500);
	});
	it("bounds pending tail callbacks before a burst can consume unbounded memory", () => {
		const setImmediateSpy = vi.spyOn(globalThis, "setImmediate").mockImplementation(() => /** @type {any} */ (0));
		try {
			const service = new AnalyticsService();
			const line = JSON.stringify({ status: 200, time_iso8601: "2026-09-01T12:00:00.000Z" });
			for (let i = 0; i < 2_500; i++) service.enqueueLine(line);

			expect(service.lineQueue).toHaveLength(2_000);
			expect(service.droppedLineCount).toBe(500);
		} finally {
			setImmediateSpy.mockRestore();
		}
	});
	it("stops input, waits for the detached flush and persists its successor buffer exactly once", async () => {
		const service = new AnalyticsService();
		const pending = Promise.withResolvers();
		const details = [];
		const totals = [];
		vi.spyOn(service, "flushDetailedLogs").mockImplementation(async (batch) => {
			details.push(...batch);
			if (details.length === 1) await pending.promise;
		});
		vi.spyOn(service, "flushAggregations").mockImplementation(async (batch) => totals.push(...batch));
		const line = (path) => JSON.stringify({ request_uri: path, status: 200, body_bytes_sent: 20 });
		service.processLine(line("/first"));
		const initialFlush = service.flush();
		service.processLine(line("/successor"));
		service.enqueueLine(line("/already-queued"));
		const stopping = service.stop();
		service.enqueueLine(line("/too-late-queued"));
		service.processLine(line("/too-late-direct"));
		const repeatedStop = service.stop();
		expect(details.map((row) => row.path)).toEqual(["/first"]);
		pending.resolve();
		await Promise.all([initialFlush, stopping, repeatedStop]);
		expect(details.map((row) => row.path)).toEqual(["/first", "/successor", "/already-queued"]);
		expect(totals.reduce((sum, row) => sum + row.count, 0)).toBe(3);
		expect(service.getStatus()).toMatchObject({
			detailedBufferSize: 0,
			aggregationBufferSize: 0,
			lineQueueSize: 0,
		});
	});

	it("normalizes unsafe or malformed byte counts without discarding neighboring requests", () => {
		const service = new AnalyticsService();
		for (const bytes of [3 * 1024 ** 3, "4294967296", -1, "12garbage", "1e309", "9007199254740993", null]) {
			service.processLine(
				JSON.stringify({ body_bytes_sent: bytes, status: 200, time_iso8601: "2026-10-15T12:00:00Z" }),
			);
		}
		expect(service.detailedLogBuffer.map((row) => row.bytes)).toEqual([3221225472, 4294967296, 0, 0, 0, 0, 0]);
		expect([...service.aggregationBuffer.values()][0]).toMatchObject({ count: 7, bytes: 7516192768 });
		service.processLine(
			JSON.stringify({
				body_bytes_sent: Number.MAX_SAFE_INTEGER,
				status: 200,
				time_iso8601: "2026-10-15T12:00:00Z",
			}),
		);
		expect([...service.aggregationBuffer.values()][0].bytes).toBe(Number.MAX_SAFE_INTEGER);
	});

	it("rolls back earlier chunks if a later aggregation chunk fails, so retry cannot double count", async () => {
		const committed = [];
		mocks.transaction.mockImplementation(async (callback) => {
			const pending = [];
			await callback(pending);
			committed.push(...pending);
		});
		mocks.query.mockImplementation((pending) => ({
			insert: (row) => ({
				onConflict: () => ({
					merge: async () => {
						if (row.proxy_host_id === 251) throw new Error("database failed");
						pending.push(row);
					},
				}),
			}),
		}));
		const service = new AnalyticsService();
		await expect(service.flushAggregations(Array.from({ length: 251 }, (_, i) => entry(i + 1)))).rejects.toThrow(
			"database failed",
		);
		expect(committed).toEqual([]);
	});
});
