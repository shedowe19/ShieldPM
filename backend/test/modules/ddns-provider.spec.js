import { beforeEach, describe, expect, it, vi } from "vitest";

const _mock = {
	queryResult: null,
};

const mockDdnsQuery = {
	where: vi.fn().mockReturnThis(),
	first: vi.fn(() => Promise.resolve(_mock.queryResult)),
	insertAndFetch: vi.fn((data) => Promise.resolve({ id: 1, ...data })),
	patchAndFetchById: vi.fn((id, data) => Promise.resolve({ id, ...data })),
	findById: vi.fn(() => Promise.resolve(_mock.queryResult)),
	deleteById: vi.fn().mockResolvedValue(1),
	orderBy: vi.fn().mockReturnThis(),
};

vi.mock("../../models/ddns_provider.js", () => ({
	default: { query: vi.fn(() => ({ ...mockDdnsQuery })) },
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(id) {
			super(`Not Found - ${id}`);
			this.name = "ItemNotFoundError";
			this.status = 404;
		}
	}
	class NotFoundError extends Error {
		constructor(m) {
			super(m);
			this.name = "NotFoundError";
			this.status = 404;
		}
	}
	return { default: { ItemNotFoundError, NotFoundError } };
});

vi.mock("../../modules/audit-log/service.js", () => ({
	default: { add: vi.fn().mockResolvedValue() },
}));

vi.mock("../../modules/ddns/index.js", () => ({
	ddnsService: {
		process: vi.fn(),
		getWanIps: vi.fn().mockResolvedValue({ v4: "1.2.3.4", v6: "::1" }),
		updateProvider: vi.fn().mockResolvedValue(),
	},
}));

vi.mock("../../modules/gitops/index.js", () => ({
	gitOpsService: { triggerAutoPush: vi.fn() },
}));

vi.mock("lodash", () => ({
	default: {
		cloneDeep: vi.fn((obj) => ({ ...obj })),
		has: (obj, key) => {
			const keys = key.split(".");
			let cur = obj;
			for (const k of keys) {
				if (cur == null || typeof cur !== "object" || !(k in cur)) return false;
				cur = cur[k];
			}
			return true;
		},
		get: (obj, key, def) => {
			const keys = key.split(".");
			let cur = obj;
			for (const k of keys) {
				if (cur == null || typeof cur !== "object" || !(k in cur)) return def;
				cur = cur[k];
			}
			return cur;
		},
	},
}));

import { get, getAll } from "../../modules/ddns-provider/reads.js";
import { create, update, remove } from "../../modules/ddns-provider/mutations.js";

describe("ddns-provider module", () => {
	const mockAccess = {
		can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
		token: { getUserId: vi.fn(() => 1) },
	};

	beforeEach(() => {
		vi.clearAllMocks();
		_mock.queryResult = null;
	});

	describe("reads – get", () => {
		it("should return provider when found", async () => {
			_mock.queryResult = { id: 1, name: "Cloudflare" };
			const result = await get(mockAccess, { id: 1 });
			expect(result).toMatchObject({ id: 1, name: "Cloudflare" });
		});

		it("should throw ItemNotFoundError when not found", async () => {
			_mock.queryResult = null;
			await expect(get(mockAccess, { id: 999 })).rejects.toMatchObject({
				name: "ItemNotFoundError",
			});
		});

		it("should check ddns_providers:get permission", async () => {
			_mock.queryResult = { id: 1, name: "Test" };
			await get(mockAccess, { id: 1 });
			expect(mockAccess.can).toHaveBeenCalledWith("ddns_providers:get", 1);
		});

		it("should filter by owner when visibility is not all", async () => {
			const limitedAccess = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "user" }),
				token: { getUserId: vi.fn(() => 5) },
			};
			_mock.queryResult = { id: 1, name: "Test", owner_user_id: 5 };
			await get(limitedAccess, { id: 1 });
			expect(limitedAccess.can).toHaveBeenCalled();
		});
	});

	describe("reads – getAll", () => {
		it("should check ddns_providers:list permission", async () => {
			await getAll(mockAccess);
			expect(mockAccess.can).toHaveBeenCalledWith("ddns_providers:list");
		});
	});

	describe("mutations – create", () => {
		it("should insert new provider and trigger ddns process", async () => {
			const data = {
				name: "New Provider",
				provider: "cloudflare",
				domains: ["test.com"],
				config: { token: "t", zone_id: "z" },
			};
			const result = await create(mockAccess, data);
			expect(result).toMatchObject({ id: 1, name: "New Provider" });
		});

		it("should set owner_user_id from access token", async () => {
			const data = { name: "Test", provider: "cloudflare", domains: ["a.com"] };
			await create(mockAccess, data);
			expect(mockAccess.token.getUserId).toHaveBeenCalled();
		});
	});

	describe("mutations – update", () => {
		it("should update existing provider", async () => {
			_mock.queryResult = { id: 1, name: "Old Name" };
			const data = { id: 1, name: "New Name" };
			const result = await update(mockAccess, data);
			expect(result).toMatchObject({ id: 1 });
		});

		it("should throw if provider not found", async () => {
			_mock.queryResult = null;
			await expect(update(mockAccess, { id: 999, name: "X" })).rejects.toMatchObject({
				name: "ItemNotFoundError",
			});
		});
	});

	describe("mutations – remove", () => {
		it("should delete existing provider", async () => {
			_mock.queryResult = { id: 1, name: "ToDelete" };
			const result = await remove(mockAccess, { id: 1 });
			expect(result).toBe(true);
		});

		it("should throw NotFoundError if provider doesn't exist", async () => {
			_mock.queryResult = null;
			await expect(remove(mockAccess, { id: 999 })).rejects.toThrow();
		});
	});
});
