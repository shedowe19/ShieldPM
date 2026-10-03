import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("src/api/backend/firewallLists");

import {
	type FirewallList,
	getFirewallList,
	getFirewallLists,
	refreshFirewallList,
} from "src/api/backend/firewallLists";
import { useFirewallList, useFirewallLists, useRefreshFirewallList } from "./useFirewallLists";

const saved: FirewallList = {
	id: 7,
	name: "VPN networks",
	reason: "Website access rule",
	description: "",
	sourceType: "url",
	sourceUrl: "https://example.test/vpn.txt",
	updateIntervalHours: 24,
	enabled: true,
	entryCount: 1,
	entries: "203.0.113.0/24",
	lastUpdatedOn: "2026-10-03 10:00:00",
	lastError: null,
};
let client: QueryClient;

beforeEach(() => {
	vi.clearAllMocks();
	client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	vi.mocked(getFirewallLists).mockResolvedValue([saved]);
	vi.mocked(getFirewallList).mockResolvedValue(saved);
});
afterEach(() => {
	cleanup();
	client.clear();
});

function open() {
	return renderHook(
		() => ({ lists: useFirewallLists(), list: useFirewallList(saved.id), refresh: useRefreshFirewallList() }),
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={client}>{children}</QueryClientProvider>
			),
		},
	);
}

it("reloads the persisted failure status after a rejected refresh while retaining the working list", async () => {
	const { result } = open();
	await waitFor(() => expect(result.current.list.data).toEqual(saved));
	await waitFor(() => expect(result.current.lists.data).toEqual([saved]));
	const failed = { ...saved, lastError: "Source download failed" };
	vi.mocked(getFirewallLists).mockResolvedValue([failed]);
	vi.mocked(getFirewallList).mockResolvedValue(failed);
	vi.mocked(refreshFirewallList).mockRejectedValue(new Error(failed.lastError));

	await act(async () => {
		await expect(result.current.refresh.mutateAsync(saved.id)).rejects.toThrow("Source download failed");
	});

	await waitFor(() => expect(result.current.list.data).toEqual(failed));
	expect(result.current.lists.data).toEqual([failed]);
	expect(getFirewallLists).toHaveBeenCalledTimes(2);
	expect(getFirewallList).toHaveBeenCalledTimes(2);
});

it("still reloads successful refreshes and invalidates host and audit views", async () => {
	const keys = [["proxy-hosts"], ["proxy-host", 17], ["audit-logs"]];
	for (const key of keys) client.setQueryData(key, { saved: true });
	const { result } = open();
	await waitFor(() => expect(result.current.list.data).toEqual(saved));
	const updated = { ...saved, entryCount: 2, lastUpdatedOn: "2026-10-03 11:00:00" };
	vi.mocked(getFirewallLists).mockResolvedValue([updated]);
	vi.mocked(getFirewallList).mockResolvedValue(updated);
	vi.mocked(refreshFirewallList).mockResolvedValue(updated);

	await act(() => result.current.refresh.mutateAsync(saved.id));

	await waitFor(() => expect(result.current.lists.data).toEqual([updated]));
	expect(result.current.list.data).toEqual(updated);
	for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});
