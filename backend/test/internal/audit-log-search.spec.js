import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	castJsonIfNeed: vi.fn((column) => column),
	query: vi.fn(),
}));

vi.mock("../../lib/error.js", () => ({ default: {} }));
vi.mock("../../lib/helpers.js", () => ({ castJsonIfNeed: mocks.castJsonIfNeed }));
vi.mock("../../models/audit-log.js", () => ({ default: { query: mocks.query } }));

import internalAuditLog from "../../internal/audit-log.js";

const createQuery = () => {
	const query = Object.assign(Promise.resolve([]), {
		allowGraph: vi.fn(),
		limit: vi.fn(),
		orderBy: vi.fn(),
		where: vi.fn(),
		withGraphFetched: vi.fn(),
	});

	for (const method of ["allowGraph", "limit", "orderBy", "where", "withGraphFetched"]) {
		query[method].mockReturnValue(query);
	}

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
});
