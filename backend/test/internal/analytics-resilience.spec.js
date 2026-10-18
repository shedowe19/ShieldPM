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
});
