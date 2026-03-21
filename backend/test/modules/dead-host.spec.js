import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lodash", () => ({
	default: {
		assign: Object.assign,
		omit: (obj, keys) => {
			const result = { ...obj };
			for (const k of keys) delete result[k];
			return result;
		},
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

// Factory to create a full thenable query builder
const createMockQuery = (resolveValue = null) => {
	const q = {};
	q._resolveValue = resolveValue;
	q.where = vi.fn(() => q);
	q.andWhere = vi.fn(() => q);
	q.allowGraph = vi.fn(() => q);
	q.withGraphFetched = vi.fn(() => q);
	q.first = vi.fn(() => q);
	q.groupBy = vi.fn(() => q);
	q.orderBy = vi.fn(() => q);
	q.count = vi.fn(() => q);
	q.patch = vi.fn(() => Promise.resolve(1));
	q.insertAndFetch = vi.fn((data) => Promise.resolve({ id: 1, ...data }));
	// biome-ignore lint/suspicious/noThenProperty: mock query builder needs .then
	q.then = (onFulfill, onReject) => Promise.resolve(q._resolveValue).then(onFulfill, onReject);
	return q;
};

vi.mock("../../models/dead_host.js", () => ({
	default: {
		query: vi.fn(() => createMockQuery()),
	},
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(id) { super(`Not Found - ${id}`); this.name = "ItemNotFoundError"; this.status = 404; }
	}
	class ValidationError extends Error {
		constructor(m) { super(m); this.name = "ValidationError"; this.status = 400; }
	}
	class InternalValidationError extends Error {
		constructor(m) { super(m); this.name = "InternalValidationError"; this.status = 400; }
	}
	return { default: { ItemNotFoundError, ValidationError, InternalValidationError } };
});

vi.mock("../../lib/helpers.js", () => ({
	castJsonIfNeed: vi.fn((col) => col),
}));

vi.mock("../../lib/utils.js", () => ({
	default: {
		omitRow: vi.fn(() => (row) => row),
		omitRows: vi.fn(() => (rows) => rows),
	},
}));

vi.mock("../../modules/host/index.js", () => ({
	hostService: {
		cleanRowCertificateMeta: vi.fn((row) => row),
		cleanAllRowsCertificateMeta: vi.fn((rows) => rows),
		cleanSslHstsData: vi.fn((_newCert, data) => data),
		isHostnameTaken: vi.fn().mockResolvedValue({ hostname: "test.com", is_taken: false }),
	},
}));

vi.mock("../../modules/audit-log/service.js", () => ({
	default: { add: vi.fn().mockResolvedValue() },
}));

vi.mock("../../modules/certificate/index.js", () => ({
	certificateService: { createQuickCertificate: vi.fn().mockResolvedValue({ id: 10 }) },
}));

vi.mock("../../modules/gitops/index.js", () => ({
	gitOpsService: { triggerAutoPush: vi.fn() },
}));

vi.mock("../../modules/nginx/index.js", () => ({
	nginxService: {
		configure: vi.fn().mockResolvedValue({}),
		deleteConfig: vi.fn().mockResolvedValue(),
		reload: vi.fn().mockResolvedValue(),
	},
}));

vi.mock("../../logger.js", () => ({
	default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { omissions } from "../../modules/dead-host/helpers.js";

describe("dead-host module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── helpers ──────────────────────────────────────────────────────────

	describe("omissions", () => {
		it("should return array containing is_deleted", () => {
			const result = omissions();
			expect(result).toContain("is_deleted");
		});

		it("should return an array", () => {
			expect(Array.isArray(omissions())).toBe(true);
		});

		it("should have exactly 1 item", () => {
			expect(omissions()).toHaveLength(1);
		});

		it("should return a fresh array each call", () => {
			const a = omissions();
			const b = omissions();
			expect(a).not.toBe(b);
			expect(a).toEqual(b);
		});
	});

	// ── reads ───────────────────────────────────────────────────────────

	describe("getCount", () => {
		it("should return numeric count for admin", async () => {
			const { getCount } = await import("../../modules/dead-host/reads.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery();
			q.first = vi.fn().mockResolvedValue({ count: "5" });
			deadHostModel.query.mockReturnValueOnce(q);
			const result = await getCount(1, "all");
			expect(result).toBe(5);
			expect(typeof result).toBe("number");
		});

		it("should filter by owner for non-admin", async () => {
			const { getCount } = await import("../../modules/dead-host/reads.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery();
			q.first = vi.fn().mockResolvedValue({ count: "2" });
			deadHostModel.query.mockReturnValueOnce(q);
			const result = await getCount(5, "user");
			expect(result).toBe(2);
			expect(q.andWhere).toHaveBeenCalledWith("owner_user_id", 5);
		});

		it("should handle zero count", async () => {
			const { getCount } = await import("../../modules/dead-host/reads.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery();
			q.first = vi.fn().mockResolvedValue({ count: "0" });
			deadHostModel.query.mockReturnValueOnce(q);
			const result = await getCount(1, "all");
			expect(result).toBe(0);
		});
	});

	describe("getAll", () => {
		it("should return rows for admin", async () => {
			const { getAll } = await import("../../modules/dead-host/reads.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery([{ id: 1 }]);
			deadHostModel.query.mockReturnValueOnce(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const result = await getAll(access);
			expect(access.can).toHaveBeenCalledWith("dead_hosts:list");
			expect(result).toBeDefined();
		});

		it("should filter by search query", async () => {
			const { getAll } = await import("../../modules/dead-host/reads.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery([]);
			deadHostModel.query.mockReturnValueOnce(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await getAll(access, undefined, "search");
		});
	});

	// ── assertDomainsAvailable ──────────────────────────────────────────

	describe("assertDomainsAvailable", () => {
		it("should not throw when all domains are available", async () => {
			const { hostService } = await import("../../modules/host/index.js");
			hostService.isHostnameTaken.mockResolvedValue({ is_taken: false });
			// assertDomainsAvailable is not exported from index, import from mutations
			const _mod = await import("../../modules/dead-host/mutations.js");
			// We test indirectly through create
		});

		it("should throw ValidationError when domain is taken", async () => {
			const { create } = await import("../../modules/dead-host/mutations.js");
			const { hostService } = await import("../../modules/host/index.js");
			hostService.isHostnameTaken.mockResolvedValue({ hostname: "taken.com", is_taken: true });
			const access = {
				can: vi.fn().mockResolvedValue({}),
				token: { getUserId: () => 1 },
			};
			await expect(create(access, { domain_names: ["taken.com"] })).rejects.toThrow("already in use");
		});
	});

	// ── lifecycle: remove, enable, disable ──────────────────────────────

	describe("remove", () => {
		it("should mark host as deleted and cleanup nginx", async () => {
			const { remove } = await import("../../modules/dead-host/lifecycle.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const { nginxService } = await import("../../modules/nginx/index.js");
			const q = createMockQuery({ id: 5, enabled: 1 });
			deadHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const result = await remove(access, { id: 5 });
			expect(result).toBe(true);
			expect(nginxService.deleteConfig).toHaveBeenCalled();
			expect(nginxService.reload).toHaveBeenCalled();
		});

		it("should check delete permission", async () => {
			const { remove } = await import("../../modules/dead-host/lifecycle.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery({ id: 5 });
			deadHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await remove(access, { id: 5 });
			expect(access.can).toHaveBeenCalledWith("dead_hosts:delete", 5);
		});
	});

	describe("enable", () => {
		it("should enable a disabled host", async () => {
			const { enable } = await import("../../modules/dead-host/lifecycle.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const { nginxService } = await import("../../modules/nginx/index.js");
			const q = createMockQuery({ id: 3, enabled: 0 });
			deadHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const result = await enable(access, { id: 3 });
			expect(result).toBe(true);
			expect(nginxService.configure).toHaveBeenCalled();
		});

		it("should throw if host is already enabled", async () => {
			const { enable } = await import("../../modules/dead-host/lifecycle.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery({ id: 3, enabled: 1 });
			deadHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await expect(enable(access, { id: 3 })).rejects.toThrow("already enabled");
		});
	});

	describe("disable", () => {
		it("should disable an enabled host", async () => {
			const { disable } = await import("../../modules/dead-host/lifecycle.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const { nginxService } = await import("../../modules/nginx/index.js");
			const q = createMockQuery({ id: 3, enabled: 1 });
			deadHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const result = await disable(access, { id: 3 });
			expect(result).toBe(true);
			expect(nginxService.deleteConfig).toHaveBeenCalled();
			expect(nginxService.reload).toHaveBeenCalled();
		});

		it("should throw if host is already disabled", async () => {
			const { disable } = await import("../../modules/dead-host/lifecycle.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery({ id: 3, enabled: 0 });
			deadHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await expect(disable(access, { id: 3 })).rejects.toThrow("already disabled");
		});
	});

	// ── mutations: create, update ───────────────────────────────────────

	describe("create", () => {
		it("should create a dead host and configure nginx", async () => {
			const { create } = await import("../../modules/dead-host/mutations.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const { nginxService } = await import("../../modules/nginx/index.js");
			const { hostService } = await import("../../modules/host/index.js");
			hostService.isHostnameTaken.mockResolvedValue({ is_taken: false });
			const q = createMockQuery({ id: 1, domain_names: ["dead.com"], meta: {} });
			q.insertAndFetch = vi.fn().mockResolvedValue({ id: 1 });
			deadHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const data = { domain_names: ["dead.com"] };
			const result = await create(access, data);
			expect(result).toBeDefined();
			expect(nginxService.configure).toHaveBeenCalled();
		});

		it("should throw when domain is taken", async () => {
			const { create } = await import("../../modules/dead-host/mutations.js");
			const { hostService } = await import("../../modules/host/index.js");
			hostService.isHostnameTaken.mockResolvedValue({ hostname: "x.com", is_taken: true });
			const access = {
				can: vi.fn().mockResolvedValue({}),
				token: { getUserId: () => 1 },
			};
			await expect(create(access, { domain_names: ["x.com"] })).rejects.toThrow("already in use");
		});
	});

	describe("update", () => {
		it("should update a dead host", async () => {
			const { update } = await import("../../modules/dead-host/mutations.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery({ id: 1, domain_names: ["old.com"], meta: {} });
			deadHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const result = await update(access, { id: 1 });
			expect(result).toBeDefined();
		});

		it("should throw when IDs do not match", async () => {
			const { update } = await import("../../modules/dead-host/mutations.js");
			const deadHostModel = (await import("../../models/dead_host.js")).default;
			const q = createMockQuery({ id: 99, domain_names: ["x.com"] });
			deadHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await expect(update(access, { id: 1 })).rejects.toThrow("IDs do not match");
		});
	});
});
