import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	insert: vi.fn(),
	merge: vi.fn(),
	onConflict: vi.fn(),
	query: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("../../models/analytic_count.js", () => ({
	default: {
		knex: vi.fn(() => ({ raw: vi.fn((sql, bindings) => ({ bindings, sql })) })),
		query: mocks.query,
		transaction: mocks.transaction,
	},
}));

import { AnalyticsService } from "../../internal/analytics.js";

describe("AnalyticsService aggregation upserts", () => {
	beforeEach(() => {
		mocks.merge.mockReset();
		mocks.onConflict.mockReset();
		mocks.insert.mockReset();
		mocks.query.mockReset();
		mocks.transaction.mockReset();

		mocks.onConflict.mockReturnValue({ merge: mocks.merge });
		mocks.insert.mockReturnValue({ onConflict: mocks.onConflict });
		mocks.query.mockReturnValue({ insert: mocks.insert });
		mocks.transaction.mockImplementation(async (callback) => callback({}));
	});

	it("uses a non-null aggregation key for both global and host analytics rows", async () => {
		const service = new AnalyticsService("/tmp/unused-analytics-log");

		await service.flushAggregations([
			{
				host_id: 0,
				timestamp: "2026-07-12T18:11:00.000Z",
				count: 1,
				bytes: 4,
				status_2xx: 1,
				status_3xx: 0,
				status_4xx: 0,
				status_5xx: 0,
			},
			{
				host_id: 7,
				timestamp: "2026-07-12T18:11:00.000Z",
				count: 2,
				bytes: 8,
				status_2xx: 1,
				status_3xx: 1,
				status_4xx: 0,
				status_5xx: 0,
			},
		]);

		expect(mocks.insert).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				aggregation_generation: "live",
				aggregation_key: "global",
				aggregation_timestamp: "2026-07-12T18:11:00.000Z",
				proxy_host_id: null,
			}),
		);
		expect(mocks.insert).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				aggregation_generation: "live",
				aggregation_key: "host:7",
				aggregation_timestamp: "2026-07-12T18:11:00.000Z",
				proxy_host_id: 7,
			}),
		);
		expect(mocks.onConflict).toHaveBeenCalledWith([
			"aggregation_key",
			"aggregation_timestamp",
			"aggregation_generation",
		]);
	});
});
