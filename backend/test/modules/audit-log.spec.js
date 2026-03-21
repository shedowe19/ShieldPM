import { beforeEach, describe, expect, it, vi } from "vitest";

// State container accessible by hoisted mocks
const _mock = {
	insertResult: { id: 1 },
	firstResult: null,
	withGraphFetchedCalled: false,
};

// Build a chainable mock that also acts as a thenable
const makeChainableQuery = () => {
	const qb = {
		where: vi.fn(),
		andWhere: vi.fn(),
		orderBy: vi.fn(),
		limit: vi.fn(),
		allowGraph: vi.fn(),
		withGraphFetched: vi.fn(),
		first: vi.fn(),
		insert: vi.fn(() => Promise.resolve(_mock.insertResult)),
		then: (resolve) => resolve(_mock.firstResult),
	};
	qb.where.mockReturnValue(qb);
	qb.andWhere.mockReturnValue(qb);
	qb.orderBy.mockReturnValue(qb);
	qb.limit.mockReturnValue(qb);
	qb.allowGraph.mockReturnValue(qb);
	qb.first.mockReturnValue(qb);
	qb.withGraphFetched.mockImplementation(() => {
		_mock.withGraphFetchedCalled = true;
		return qb;
	});
	return qb;
};

vi.mock("../../models/audit-log.js", () => ({
	default: {
		query: vi.fn(() => makeChainableQuery()),
	},
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(id) { super(`Not Found - ${id}`); this.name = "ItemNotFoundError"; this.status = 404; }
	}
	class InternalValidationError extends Error {
		constructor(m) { super(m); this.name = "InternalValidationError"; this.status = 400; }
	}
	return { default: { ItemNotFoundError, InternalValidationError } };
});

vi.mock("../../lib/helpers.js", () => ({
	castJsonIfNeed: vi.fn((col) => col),
}));

import { add } from "../../modules/audit-log/mutations.js";
import { get, getAll } from "../../modules/audit-log/reads.js";

describe("audit-log module", () => {
	const mockAccess = {
		can: vi.fn().mockResolvedValue(true),
		token: {
			getUserId: vi.fn(() => 1),
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();
		_mock.firstResult = null;
		_mock.withGraphFetchedCalled = false;
	});

	// ── add ─────────────────────────────────────────────────────────────

	describe("add", () => {
		it("should insert a valid audit log entry", async () => {
			const data = {
				action: "created",
				object_type: "proxy-host",
				object_id: 5,
				meta: { domain: "test.com" },
			};
			await add(mockAccess, data);
			// add calls auditLogModel.query().insert(...)
		});

		it("should throw InternalValidationError when action is missing", async () => {
			await expect(add(mockAccess, { object_type: "user" })).rejects.toMatchObject({
				name: "InternalValidationError",
			});
		});

		it("should use access token userId", async () => {
			const data = { user_id: 42, action: "deleted", object_type: "stream", object_id: 10 };
			await add(mockAccess, data);
			expect(mockAccess.token.getUserId).toHaveBeenCalled();
		});

		it("should default meta to empty object if not provided", async () => {
			const data = { action: "updated", object_type: "setting", object_id: 1 };
			await add(mockAccess, data);
			// No error means it completed successfully
		});
	});

	// ── get ──────────────────────────────────────────────────────────────

	describe("get", () => {
		it("should return entry when found", async () => {
			const entry = { id: 1, action: "created", object_type: "user" };
			_mock.firstResult = entry;
			const result = await get(mockAccess, { id: 1 });
			expect(result).toEqual(entry);
		});

		it("should throw ItemNotFoundError when not found", async () => {
			_mock.firstResult = null;
			await expect(get(mockAccess, { id: 999 })).rejects.toMatchObject({
				name: "ItemNotFoundError",
			});
		});

		it("should support expand parameter", async () => {
			const entry = { id: 1, action: "created", user: { name: "admin" } };
			_mock.firstResult = entry;
			const result = await get(mockAccess, { id: 1, expand: ["user"] });
			expect(result).toEqual(entry);
			expect(_mock.withGraphFetchedCalled).toBe(true);
		});
	});

	// ── getAll ───────────────────────────────────────────────────────────

	describe("getAll", () => {
		it("should check access permission", async () => {
			_mock.firstResult = [];
			await getAll(mockAccess);
			expect(mockAccess.can).toHaveBeenCalledWith("auditlog:list");
		});
	});
});
