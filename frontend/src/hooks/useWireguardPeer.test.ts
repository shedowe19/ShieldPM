import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getWireguardPeers: vi.fn(),
	pollingEnvironment: { isDocumentVisible: true, isOnline: true },
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
	useMutation: vi.fn(),
	useQuery: mocks.useQuery,
	useQueryClient: vi.fn(),
}));
vi.mock("src/api/backend", () => ({ getWireguardPeers: mocks.getWireguardPeers }));
vi.mock("./usePollingEnvironment", () => ({
	usePollingEnvironment: () => mocks.pollingEnvironment,
}));

import { useWireguardPeers } from "./useWireguardPeer";

type WireguardPeersQueryOptions = {
	refetchInterval: unknown;
	retry: boolean;
};

const getQueryOptions = () => mocks.useQuery.mock.calls[0]?.[0] as WireguardPeersQueryOptions;

const getPollingInterval = (failureCount: number) => {
	const interval = getQueryOptions().refetchInterval;
	expect(interval).toBeTypeOf("function");
	return typeof interval === "function" ? interval({ state: { fetchFailureCount: failureCount } }) : undefined;
};

describe("useWireguardPeers", () => {
	beforeEach(() => {
		mocks.useQuery.mockReset();
		mocks.pollingEnvironment = { isDocumentVisible: true, isOnline: true };
	});

	it("pauses live-status polling while the document is hidden or offline", () => {
		mocks.pollingEnvironment = { isDocumentVisible: false, isOnline: true };
		useWireguardPeers();

		expect(getPollingInterval(0)).toBe(false);

		mocks.useQuery.mockReset();
		mocks.pollingEnvironment = { isDocumentVisible: true, isOnline: false };
		useWireguardPeers();

		expect(getPollingInterval(0)).toBe(false);
	});

	it("keeps live updates at thirty seconds and backs off after failures", () => {
		useWireguardPeers();

		expect(getQueryOptions().retry).toBe(false);
		expect(getPollingInterval(0)).toBe(30_000);
		expect(getPollingInterval(2)).toBe(120_000);
	});
});
