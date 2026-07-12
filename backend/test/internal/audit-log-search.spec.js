import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	castJsonIfNeed: vi.fn((column) => column),
	query: vi.fn(),
}));

vi.mock("../../lib/error.js", () => ({ default: {} }));
vi.mock("../../lib/helpers.js", () => ({ castJsonIfNeed: mocks.castJsonIfNeed }));
vi.mock("../../models/audit-log.js", () => ({ default: { query: mocks.query } }));

import internalAuditLog from "../../internal/audit-log.js";

const createQuery = (pageResult = { results: [], total: 0 }) => {
	const query = Object.assign(Promise.resolve([]), {
		allowGraph: vi.fn(),
		limit: vi.fn(),
		orderBy: vi.fn(),
		page: vi.fn(),
		where: vi.fn(),
		withGraphFetched: vi.fn(),
	});

	for (const method of ["allowGraph", "limit", "orderBy", "where", "withGraphFetched"]) {
		query[method].mockReturnValue(query);
	}
	query.page.mockResolvedValue(pageResult);

	return query;
};

describe("audit log search", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("searches metadata, actions, and object types with a complete substring pattern", async () => {
		const query = createQuery();
		const searchConditions = {
			orWhere: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
		};
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		mocks.query.mockReturnValue(query);

		await internalAuditLog.getAll(access, undefined, "proxy-host");

		expect(access.can).toHaveBeenCalledWith("auditlog:list");
		expect(query.where).toHaveBeenCalledWith(expect.any(Function));
		query.where.mock.calls[0][0].call(searchConditions);

		expect(mocks.castJsonIfNeed).toHaveBeenCalledWith("meta");
		expect(searchConditions.where).toHaveBeenCalledWith("meta", "like", "%proxy-host%");
		expect(searchConditions.orWhere).toHaveBeenNthCalledWith(1, "action", "like", "%proxy-host%");
		expect(searchConditions.orWhere).toHaveBeenNthCalledWith(2, "object_type", "like", "%proxy-host%");
	});

	it("limits audit events to an inclusive creation timestamp range", async () => {
		const query = createQuery();
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		mocks.query.mockReturnValue(query);

		await internalAuditLog.getAll(access, undefined, undefined, {
			created_after: "2026-07-12T08:00:00.000Z",
			created_before: "2026-07-12T10:00:00.000Z",
		});

		expect(query.where).toHaveBeenCalledWith("created_on", ">=", "2026-07-12T08:00:00.000Z");
		expect(query.where).toHaveBeenCalledWith("created_on", "<=", "2026-07-12T10:00:00.000Z");
	});

	it("filters audit events by an exact action before applying the result limit", async () => {
		const query = createQuery();
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		mocks.query.mockReturnValue(query);

		await internalAuditLog.getAll(access, undefined, undefined, { action: "deleted" });

		expect(query.where).toHaveBeenCalledWith("action", "deleted");
	});

	it("filters audit events by an exact object type before applying the result limit", async () => {
		const query = createQuery();
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		mocks.query.mockReturnValue(query);

		await internalAuditLog.getAll(access, undefined, undefined, { object_type: "proxy-host" });

		expect(query.where).toHaveBeenCalledWith("object_type", "proxy-host");
	});

	it("filters audit events by exact user and object identifiers before applying the result limit", async () => {
		const query = createQuery();
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		mocks.query.mockReturnValue(query);

		await internalAuditLog.getAll(access, undefined, undefined, { object_id: 42, user_id: 7 });

		expect(query.where).toHaveBeenCalledWith("user_id", 7);
		expect(query.where).toHaveBeenCalledWith("object_id", 42);
	});

	it("returns a filtered audit-log page with the total result count", async () => {
		const pageRows = [{ id: 101 }];
		const query = createQuery({ results: pageRows, total: 101 });
		const access = { can: vi.fn().mockResolvedValue(undefined) };
		mocks.query.mockReturnValue(query);

		const result = await internalAuditLog.getAll(
			access,
			undefined,
			"proxy-host",
			{ action: "deleted" },
			{ limit: 100, page: 2 },
		);

		expect(query.where).toHaveBeenCalledWith("action", "deleted");
		expect(query.page).toHaveBeenCalledWith(1, 100);
		expect(result).toEqual({
			items: pageRows,
			pagination: { limit: 100, page: 2, totalItems: 101, totalPages: 2 },
		});
	});
});
