import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAuditLogs: vi.fn(),
	getAuditLogsPage: vi.fn(),
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("src/api/backend", () => ({ getAuditLogs: mocks.getAuditLogs, getAuditLogsPage: mocks.getAuditLogsPage }));

import { useAuditLogs, useAuditLogsPage } from "./useAuditLogs";

type AuditLogsQueryOptions = {
	enabled?: boolean;
	queryFn: () => Promise<unknown>;
	queryKey: unknown[];
};

const getQueryOptions = () => mocks.useQuery.mock.calls[0]?.[0] as AuditLogsQueryOptions;

describe("useAuditLogs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps an audit search and creation range isolated in React Query without replacing existing query options", async () => {
		mocks.getAuditLogs.mockResolvedValue([]);
		const action = "deleted";
		const created_after = "2026-07-12T08:00:00.000Z";
		const created_before = "2026-07-12T10:00:00.000Z";

		useAuditLogs(["user"], { enabled: false }, { action, created_after, created_before, query: "proxy-host" });

		expect(getQueryOptions().queryKey).toEqual([
			"audit-logs",
			{ action, created_after, created_before, expand: ["user"], query: "proxy-host" },
		]);
		expect(getQueryOptions().enabled).toBe(false);
		await getQueryOptions().queryFn();
		expect(mocks.getAuditLogs).toHaveBeenCalledWith(["user"], {
			action,
			created_after,
			created_before,
			query: "proxy-host",
		});
	});

	it("keeps each audit-log page and its filters in a separate React Query cache entry", async () => {
		mocks.getAuditLogsPage.mockResolvedValue({
			items: [],
			pagination: { limit: 100, page: 2, totalItems: 101, totalPages: 2 },
		});

		useAuditLogsPage(["user"], { action: "deleted", limit: 100, page: 2 }, { enabled: false });

		expect(getQueryOptions().queryKey).toEqual([
			"audit-logs",
			{ action: "deleted", expand: ["user"], limit: 100, page: 2 },
		]);
		expect(getQueryOptions().enabled).toBe(false);
		await getQueryOptions().queryFn();
		expect(mocks.getAuditLogsPage).toHaveBeenCalledWith(["user"], { action: "deleted", limit: 100, page: 2 });
	});
});
