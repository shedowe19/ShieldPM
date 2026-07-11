import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getHostsReport: vi.fn(),
	pollingEnvironment: { isDocumentVisible: true, isOnline: true },
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("src/api/backend", () => ({ getHostsReport: mocks.getHostsReport }));
vi.mock("./usePollingEnvironment", () => ({
	usePollingEnvironment: () => mocks.pollingEnvironment,
}));

import { useHostReport } from "./useHostReport";

type HostReportQueryOptions = {
	refetchInterval: (query: { state: { fetchFailureCount: number } }) => number | false;
};

const getQueryOptions = () => mocks.useQuery.mock.calls[0]?.[0] as HostReportQueryOptions;

describe("useHostReport", () => {
	beforeEach(() => {
		mocks.useQuery.mockReset();
		mocks.pollingEnvironment = { isDocumentVisible: true, isOnline: true };
	});

	it("pauses host-report polling while the document is hidden", () => {
		mocks.pollingEnvironment = { isDocumentVisible: false, isOnline: true };

		useHostReport();

		expect(getQueryOptions().refetchInterval({ state: { fetchFailureCount: 0 } })).toBe(false);
	});

	it("backs off failed host-report refreshes while the browser is eligible to poll", () => {
		useHostReport();

		expect(getQueryOptions().refetchInterval({ state: { fetchFailureCount: 2 } })).toBe(60_000);
	});
});
