import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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

	it("clears the previous host and rejects partial refresh data when series fails", async () => {
		const { result, rerender } = renderHook(({ host }) => useAnalyticsData(host, "24h"), {
			initialProps: { host: "1" },
		});
		await waitFor(() => expect(result.current.summary).toEqual({ count: 3 }));
		vi.mocked(getAnalyticsSummary).mockResolvedValue({ count: 99 });
		vi.mocked(getAnalyticsSeries).mockRejectedValue(new Error("Series failed"));
		rerender({ host: "2" });
		await waitFor(() => expect(result.current.error).toBe("Series failed"));
		expect(result.current.summary).toBeNull();
		expect(result.current.series).toEqual([]);
	});

	it("does not leave loading stuck or apply stale results when going offline", async () => {
		let complete!: (value: { count: number }) => void;
		vi.mocked(getAnalyticsSummary).mockReturnValue(
			new Promise((resolve) => {
				complete = resolve;
			}),
		);
		const { result } = renderHook(() => useAnalyticsData("1", "24h"));
		expect(result.current.loading).toBe(true);
		act(() => window.dispatchEvent(new Event("offline")));
		expect(result.current.loading).toBe(false);
		await act(async () => {
			complete({ count: 55 });
		});
		expect(result.current.summary).toBeNull();
	});

	it("starts independent requests together and commits only a complete pair", async () => {
		let complete!: (value: { count: number }) => void;
		vi.mocked(getAnalyticsSummary).mockReturnValue(
			new Promise((resolve) => {
				complete = resolve;
			}),
		);
		const { result } = renderHook(() => useAnalyticsData("1", "24h"));
		expect(getAnalyticsSeries).toHaveBeenCalledWith(1, "24h");
		expect(result.current.summary).toBeNull();
		await act(async () => {
			complete({ count: 55 });
		});
		expect(result.current.summary).toEqual({ count: 55 });
		expect(result.current.series).toHaveLength(1);
	});
});
