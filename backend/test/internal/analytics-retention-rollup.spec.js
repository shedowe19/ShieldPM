import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	aggregateDelete: vi.fn().mockResolvedValue(0),
	aggregateWhere: vi.fn(),
	detailDelete: vi.fn().mockResolvedValue(0),
	detailWhere: vi.fn(),
	rollupState: { watermark: null },
}));

vi.mock("../../models/analytics_logs.js", () => ({
	default: {
		query: () => ({
			where: (...args) => {
				mocks.detailWhere(...args);
				return { delete: mocks.detailDelete };
			},
		}),
	},
}));
vi.mock("../../models/analytic_count.js", () => ({
	default: {
		query: () => ({
			where: (...args) => {
				mocks.aggregateWhere(...args);
				return { delete: mocks.aggregateDelete };
			},
		}),
	},
}));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/analytics_hourly.js", () => ({
	default: {
		knex: () => (table) => {
			if (table === "analytics_rollup_state") {
				return { where: () => ({ first: async () => mocks.rollupState }) };
			}
			return { select: () => ({ where: () => ({ limit: async () => [] }) }) };
		},
	},
}));

import { AnalyticsService } from "../../internal/analytics.js";

describe("analytics retention and hourly rollup coverage", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-23T12:00:00.000Z"));
		mocks.detailWhere.mockReset();
		mocks.aggregateWhere.mockReset();
		mocks.detailDelete.mockClear();
		mocks.aggregateDelete.mockClear();
		mocks.rollupState.watermark = null;
		mocks.rollupState.coverage_start = null;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps raw detail rows until the hourly rollup has committed coverage", async () => {
		await new AnalyticsService().runRetention();

		expect(mocks.detailWhere).not.toHaveBeenCalled();
		expect(mocks.aggregateWhere).toHaveBeenCalledWith("timestamp", "<", dayjs().subtract(35, "day").toISOString());
	});

	it("never prunes raw detail past the committed rollup coverage", async () => {
		mocks.rollupState.coverage_start = "2026-11-20T00:00:00.000Z";
		mocks.rollupState.watermark = "2026-11-21T10:00:00.000Z";

		await new AnalyticsService().runRetention();

		expect(mocks.detailWhere).toHaveBeenCalledWith("time", "<", "2026-11-21T11:00:00.000Z");
		expect(mocks.detailDelete).toHaveBeenCalledOnce();
	});

	it("uses the configured retention once the rollup covers the whole detail window", async () => {
		mocks.rollupState.coverage_start = "2026-11-21T00:00:00.000Z";
		mocks.rollupState.watermark = "2026-11-22T11:00:00.000Z";

		await new AnalyticsService().runRetention();

		expect(mocks.detailWhere).toHaveBeenCalledWith("time", "<", "2026-11-22T12:00:00.000Z");
	});
});
