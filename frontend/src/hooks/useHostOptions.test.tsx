import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { getHostOptions } from "src/api/backend/getProxyHostOptions";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHostOptions } from "./useHostOptions";

vi.mock("src/api/backend/getProxyHostOptions", () => ({ getHostOptions: vi.fn() }));
afterEach(() => {
	cleanup();
	vi.mocked(getHostOptions).mockReset();
});
const wrap =
	(client: QueryClient) =>
	({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
describe("lightweight host selection", () => {
	it("forwards cancellation when its last consumer leaves", () => {
		vi.mocked(getHostOptions).mockImplementation(() => new Promise(() => {}));
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const { unmount } = renderHook(() => useHostOptions(), { wrapper: wrap(client) });
		const signal = vi.mocked(getHostOptions).mock.calls[0][0] as AbortSignal;
		expect(signal.aborted).toBe(false);
		unmount();
		expect(signal.aborted).toBe(true);
		client.clear();
	});
	it("shares the options request and keeps it alive for another active consumer", () => {
		vi.mocked(getHostOptions).mockImplementation(() => new Promise(() => {}));
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const first = renderHook(() => useHostOptions(), { wrapper: wrap(client) });
		const second = renderHook(() => useHostOptions(), { wrapper: wrap(client) });
		expect(getHostOptions).toHaveBeenCalledTimes(1);
		const signal = vi.mocked(getHostOptions).mock.calls[0][0] as AbortSignal;
		first.unmount();
		expect(signal.aborted).toBe(false);
		second.unmount();
		expect(signal.aborted).toBe(true);
		client.clear();
	});
});
