import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAnalyticsTopHosts: vi.fn(),
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("src/api/backend", () => ({ getAnalyticsTopHosts: mocks.getAnalyticsTopHosts }));

import { useAnalyticsTopHosts } from "./useAnalyticsTopHosts";

type TopHostsQueryOptions = {
	queryFn: () => Promise<unknown>;
	queryKey: unknown[];
};

const getQueryOptions = () => mocks.useQuery.mock.calls[0]?.[0] as TopHostsQueryOptions;

describe("useAnalyticsTopHosts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps server-error rankings in a separate cache entry and requests the matching aggregate", async () => {
		mocks.getAnalyticsTopHosts.mockResolvedValue([]);

		useAnalyticsTopHosts("server_errors");

		expect(getQueryOptions().queryKey).toEqual(["analytics", "top-hosts", "server_errors"]);
		await getQueryOptions().queryFn();
		expect(mocks.getAnalyticsTopHosts).toHaveBeenCalledWith("server_errors");
	});
});
