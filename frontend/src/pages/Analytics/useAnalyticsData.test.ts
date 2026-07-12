import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { getAnalyticsSeries, getAnalyticsSummary } from "src/api/backend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnalyticsData } from "./useAnalyticsData";

vi.mock("src/api/backend", () => ({
	getAnalyticsSeries: vi.fn(),
	getAnalyticsSummary: vi.fn(),
}));

describe("useAnalyticsData", () => {
	beforeEach(() => {
		vi.mocked(getAnalyticsSeries).mockResolvedValue([
			{ bytes: 128, count: 3, s2xx: 3, s3xx: 0, s4xx: 0, s5xx: 0, timestamp: "2026-01-01T12:00:00" },
		]);
		vi.mocked(getAnalyticsSummary).mockResolvedValue({ count: 3 });
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("loads the selected host summary and chart-ready series", async () => {
		const { result } = renderHook(() => useAnalyticsData("42", "24h"));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(getAnalyticsSummary).toHaveBeenCalledWith(42, "24h");
		expect(getAnalyticsSeries).toHaveBeenCalledWith(42, "24h");
		expect(result.current.summary).toEqual({ count: 3 });
		expect(result.current.series).toEqual([
			{
				bytes: 128,
				count: 3,
				s2xx: 3,
				s3xx: 0,
				s4xx: 0,
				s5xx: 0,
				timeDisplay: "12:00",
				timestamp: "2026-01-01T12:00:00",
			},
		]);
	});
});
