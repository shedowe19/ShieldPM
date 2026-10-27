import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics-upsert.js", () => ({ upsertAnalyticsRows: upsert }));
vi.mock("../../models/analytic_count.js", () => ({ default: {} }));
vi.mock("../../models/analytics_logs.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));

import { AnalyticsService } from "../../internal/analytics.js";

describe("analytics aggregation projection", () => {
	beforeEach(() => upsert.mockReset());
	it("preserves the distinct global and host keys sent to the transactional bulk writer", async () => {
		const entry = {
			timestamp: "2026-07-12T18:11:00.000Z",
			count: 2,
			bytes: 8,
			status_2xx: 1,
			status_3xx: 1,
			status_4xx: 0,
			status_5xx: 0,
		};
		await new AnalyticsService().flushAggregations([
			{ ...entry, host_id: 0 },
			{ ...entry, host_id: 7 },
		]);
		expect(upsert).toHaveBeenCalledWith(
			{},
			[
				expect.objectContaining({
					aggregation_key: "global",
					proxy_host_id: null,
					aggregation_generation: "live",
					aggregation_timestamp: entry.timestamp,
					request_count: 2,
				}),
				expect.objectContaining({
					aggregation_key: "host:7",
					proxy_host_id: 7,
					aggregation_generation: "live",
					aggregation_timestamp: entry.timestamp,
					request_count: 2,
				}),
			],
			250,
		);
	});
});
