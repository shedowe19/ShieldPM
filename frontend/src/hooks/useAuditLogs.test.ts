import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAuditLogs: vi.fn(),
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("src/api/backend", () => ({ getAuditLogs: mocks.getAuditLogs }));

import { useAuditLogs } from "./useAuditLogs";

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
		const created_after = "2026-07-12T08:00:00.000Z";
		const created_before = "2026-07-12T10:00:00.000Z";

		useAuditLogs(["user"], { enabled: false }, { created_after, created_before, query: "proxy-host" });

		expect(getQueryOptions().queryKey).toEqual([
			"audit-logs",
			{ created_after, created_before, expand: ["user"], query: "proxy-host" },
		]);
		expect(getQueryOptions().enabled).toBe(false);
		await getQueryOptions().queryFn();
		expect(mocks.getAuditLogs).toHaveBeenCalledWith(["user"], {
			created_after,
			created_before,
			query: "proxy-host",
		});
	});
});
