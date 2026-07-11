import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkVersion: vi.fn(),
	pollingEnvironment: { isDocumentVisible: true, isOnline: true },
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("src/api/backend", () => ({ checkVersion: mocks.checkVersion }));
vi.mock("./usePollingEnvironment", () => ({
	usePollingEnvironment: () => mocks.pollingEnvironment,
}));

import { useCheckVersion } from "./useCheckVersion";

type VersionCheckQueryOptions = {
	refetchInterval: (query: { state: { fetchFailureCount: number } }) => number | false;
};

const getQueryOptions = () => mocks.useQuery.mock.calls[0]?.[0] as VersionCheckQueryOptions;

describe("useCheckVersion", () => {
	beforeEach(() => {
		mocks.useQuery.mockReset();
		mocks.pollingEnvironment = { isDocumentVisible: true, isOnline: true };
	});

	it("pauses version polling while the browser is hidden or offline", () => {
		mocks.pollingEnvironment = { isDocumentVisible: false, isOnline: true };

		useCheckVersion();

		expect(getQueryOptions().refetchInterval({ state: { fetchFailureCount: 0 } })).toBe(false);

		mocks.useQuery.mockReset();
		mocks.pollingEnvironment = { isDocumentVisible: true, isOnline: false };
		useCheckVersion();

		expect(getQueryOptions().refetchInterval({ state: { fetchFailureCount: 0 } })).toBe(false);
	});

	it("backs off failed version checks while the browser can poll", () => {
		useCheckVersion();

		expect(getQueryOptions().refetchInterval({ state: { fetchFailureCount: 2 } })).toBe(120_000);
	});
});
