import { act, cleanup, renderHook } from "@testing-library/react";
import { getDbStats } from "src/api/backend";
import { getAnalyticsStatus } from "src/api/backend/getAnalyticsStatus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnalyticsLiveMetrics } from "./useAnalyticsLiveMetrics";

vi.mock("src/api/backend", () => ({
	getDbStats: vi.fn(),
}));

vi.mock("src/api/backend/getAnalyticsStatus", () => ({
	getAnalyticsStatus: vi.fn(),
}));

let onLineDescriptor: PropertyDescriptor | undefined;
let visibilityStateDescriptor: PropertyDescriptor | undefined;

describe("useAnalyticsLiveMetrics", () => {
	beforeEach(() => {
		onLineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
		visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
		vi.mocked(getAnalyticsStatus).mockReset();
		vi.mocked(getAnalyticsStatus).mockResolvedValue({ rxSec: 1024, totalSec: 2048, txSec: 1024 });
		vi.mocked(getDbStats).mockReset();
		vi.mocked(getDbStats).mockResolvedValue({
			connections: { max: 10, open: 2, used: 2 },
			engine: "sqlite",
			io: { reads: 3, writes: 4 },
			size: 2048,
		});
		vi.useFakeTimers();
	});

	afterEach(() => {
		cleanup();
		if (onLineDescriptor) {
			Object.defineProperty(navigator, "onLine", onLineDescriptor);
		} else {
			Reflect.deleteProperty(navigator, "onLine");
		}
		if (visibilityStateDescriptor) {
			Object.defineProperty(document, "visibilityState", visibilityStateDescriptor);
		} else {
			Reflect.deleteProperty(document, "visibilityState");
		}
		vi.useRealTimers();
	});

	it("keeps network throughput on a two-second interval while refreshing database stats every 30 seconds", async () => {
		const { result } = renderHook(() => useAnalyticsLiveMetrics());

		expect(getAnalyticsStatus).not.toHaveBeenCalled();
		expect(getDbStats).not.toHaveBeenCalled();

		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(result.current.networkSpeed).toBe(2048);
		expect(result.current.dbStats).toMatchObject({ engine: "sqlite", size: 2048 });
		expect(getAnalyticsStatus).toHaveBeenCalledOnce();
		expect(getDbStats).toHaveBeenCalledOnce();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(29_999);
		});
		expect(getDbStats).toHaveBeenCalledOnce();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		expect(getAnalyticsStatus).toHaveBeenCalledTimes(16);
		expect(getDbStats).toHaveBeenCalledTimes(2);
	});

	it("keeps reactivated polling schedules when stale requests fail after reconnecting", async () => {
		let rejectInitialLiveStatus: ((reason?: unknown) => void) | undefined;
		let rejectInitialDbStats: ((reason?: unknown) => void) | undefined;
		const initialLiveStatus = new Promise<Awaited<ReturnType<typeof getAnalyticsStatus>>>((_, reject) => {
			rejectInitialLiveStatus = reject;
		});
		const initialDbStats = new Promise<Awaited<ReturnType<typeof getDbStats>>>((_, reject) => {
			rejectInitialDbStats = reject;
		});
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
		vi.mocked(getAnalyticsStatus)
			.mockReturnValueOnce(initialLiveStatus)
			.mockResolvedValue({ rxSec: 1024, totalSec: 2048, txSec: 1024 });
		vi.mocked(getDbStats)
			.mockReturnValueOnce(initialDbStats)
			.mockResolvedValue({
				connections: { max: 10, open: 2, used: 2 },
				engine: "sqlite",
				io: { reads: 3, writes: 4 },
				size: 2048,
			});

		renderHook(() => useAnalyticsLiveMetrics());
		expect(getAnalyticsStatus).toHaveBeenCalledOnce();
		expect(getDbStats).toHaveBeenCalledOnce();

		Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
		window.dispatchEvent(new Event("offline"));
		Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
		await act(async () => {
			window.dispatchEvent(new Event("online"));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(getAnalyticsStatus).toHaveBeenCalledTimes(2);
		expect(getDbStats).toHaveBeenCalledTimes(2);
		const rejectLiveStatus = rejectInitialLiveStatus;
		const rejectDbStats = rejectInitialDbStats;
		if (!rejectLiveStatus || !rejectDbStats) {
			throw new Error("Stale request rejecter is unavailable");
		}

		await act(async () => {
			rejectLiveStatus(new Error("offline"));
			rejectDbStats(new Error("offline"));
			await Promise.resolve();
			await Promise.resolve();
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2_000);
		});
		expect(getAnalyticsStatus).toHaveBeenCalledTimes(3);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(28_000);
		});
		expect(getDbStats).toHaveBeenCalledTimes(3);
	});
});
