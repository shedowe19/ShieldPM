import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getGitSyncStatus: vi.fn(),
	pollingEnvironment: { isDocumentVisible: true, isOnline: true },
	useMutation: vi.fn(),
	useQuery: vi.fn(),
	useQueryClient: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
	useMutation: mocks.useMutation,
	useQuery: mocks.useQuery,
	useQueryClient: mocks.useQueryClient,
}));
vi.mock("src/api/backend/gitSync", () => ({
	getGitSyncStatus: mocks.getGitSyncStatus,
	triggerGitSync: vi.fn(),
	updateGitSyncConfig: vi.fn(),
}));
vi.mock("./usePollingEnvironment", () => ({
	usePollingEnvironment: () => mocks.pollingEnvironment,
}));

import { useGitSyncStatus } from "./useGitSync";

type GitSyncStatusQueryOptions = {
	refetchInterval: (query: { state: { fetchFailureCount: number } }) => number | false;
};

const getQueryOptions = () => mocks.useQuery.mock.calls[0]?.[0] as GitSyncStatusQueryOptions;

describe("useGitSyncStatus", () => {
	beforeEach(() => {
		mocks.useQuery.mockReset();
		mocks.pollingEnvironment = { isDocumentVisible: true, isOnline: true };
	});

	it("pauses status polling while the browser is hidden or offline", () => {
		mocks.pollingEnvironment = { isDocumentVisible: false, isOnline: true };

		useGitSyncStatus(42);

		expect(getQueryOptions().refetchInterval({ state: { fetchFailureCount: 0 } })).toBe(false);

		mocks.useQuery.mockReset();
		mocks.pollingEnvironment = { isDocumentVisible: true, isOnline: false };
		useGitSyncStatus(42);

		expect(getQueryOptions().refetchInterval({ state: { fetchFailureCount: 0 } })).toBe(false);
	});

	it("backs off failed status polling while the browser can poll", () => {
		useGitSyncStatus(42);

		expect(getQueryOptions().refetchInterval({ state: { fetchFailureCount: 2 } })).toBe(120_000);
	});
});
