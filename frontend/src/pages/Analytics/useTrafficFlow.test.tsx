import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { getTrafficFlow, type TrafficFlowSnapshot } from "src/api/backend/getTrafficFlow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrafficFlow } from "./useTrafficFlow";

vi.mock("src/api/backend/getTrafficFlow", () => ({ getTrafficFlow: vi.fn() }));
const clients: QueryClient[] = [];
const wrapper = () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
	clients.push(client);
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
};
beforeEach(() => {
	vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	vi.restoreAllMocks();
	vi.mocked(getTrafficFlow).mockReset();
});

describe("useTrafficFlow", () => {
	it("aborts on pause and starts a fresh request immediately on resume", () => {
		vi.mocked(getTrafficFlow).mockImplementation(() => new Promise(() => {}));
		const { rerender, unmount } = renderHook(({ paused }) => useTrafficFlow(paused), {
			initialProps: { paused: false },
			wrapper: wrapper(),
		});
		const signal = vi.mocked(getTrafficFlow).mock.calls[0][0] as AbortSignal;
		rerender({ paused: true });
		expect(signal.aborted).toBe(true);
		rerender({ paused: false });
		expect(getTrafficFlow).toHaveBeenCalledTimes(2);
		const resumedSignal = vi.mocked(getTrafficFlow).mock.calls[1][0] as AbortSignal;
		unmount();
		expect(resumedSignal.aborted).toBe(true);
	});
	it("revalidates even a recently fetched snapshot on resume despite global staleTime", async () => {
		vi.mocked(getTrafficFlow).mockResolvedValue({ enabled: true } as TrafficFlowSnapshot);
		const { result, rerender } = renderHook(({ paused }) => useTrafficFlow(paused), {
			initialProps: { paused: false },
			wrapper: wrapper(),
		});
		await waitFor(() => expect(result.current.data?.enabled).toBe(true));
		rerender({ paused: true });
		rerender({ paused: false });
		expect(getTrafficFlow).toHaveBeenCalledTimes(2);
	});
	it("does not fetch when hidden and cancels an active request on visibility loss", () => {
		const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
		vi.mocked(getTrafficFlow).mockImplementation(() => new Promise(() => {}));
		renderHook(() => useTrafficFlow(false), { wrapper: wrapper() });
		expect(getTrafficFlow).not.toHaveBeenCalled();
		visible.mockReturnValue("visible");
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		expect(getTrafficFlow).toHaveBeenCalledTimes(1);
		const signal = vi.mocked(getTrafficFlow).mock.calls[0][0] as AbortSignal;
		visible.mockReturnValue("hidden");
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		expect(signal.aborted).toBe(true);
	});
});
