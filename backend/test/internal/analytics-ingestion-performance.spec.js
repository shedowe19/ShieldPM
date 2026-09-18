import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hostQuery: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.hostQuery } }));
vi.mock("../../models/analytic_count.js", () => ({ default: {} }));
vi.mock("../../models/analytics_logs.js", () => ({ default: {} }));

import { AnalyticsService } from "../../internal/analytics.js";

const replayLine = JSON.stringify({
	body_bytes_sent: 512,
	request_method: "GET",
	request_time: "0.012",
	request_uri: "/health",
	server_name: "benchmark.example.test",
	status: 200,
	time_iso8601: "2026-09-18T12:00:00.000Z",
});

describe("analytics ingestion performance budget", () => {
	it("processes a one-thousand-line replay without dropping buffered events", () => {
		const service = new AnalyticsService();
		service.hostCache.set("benchmark.example.test", 17);
		service.flushPromise = new Promise(() => {});
		const startedAt = performance.now();

		for (let index = 0; index < 1_000; index++) {
			service.processLine(replayLine);
		}

		const elapsedMs = performance.now() - startedAt;
		expect(service.detailedLogBuffer).toHaveLength(1_000);
		expect(service.aggregationBuffer.get("17|2026-09-18T12:00:00.000Z")).toMatchObject({ count: 1_000 });
		expect(elapsedMs).toBeLessThan(250);
	});
});
