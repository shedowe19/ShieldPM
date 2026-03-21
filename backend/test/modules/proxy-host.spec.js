import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lodash", () => ({
	default: {
		assign: Object.assign,
		omit: (obj, keys) => {
			const result = { ...obj };
			for (const k of keys) {
				delete result[k];
			}
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
	q.whereExists = vi.fn(() => q);
	q.count = vi.fn(() => q);
	q.patch = vi.fn(() => Promise.resolve(1));
	q.insertGraphAndFetch = vi.fn((data) => Promise.resolve({ id: 1, ...data }));
	q.upsertGraphAndFetch = vi.fn((data) => Promise.resolve({ id: 1, ...data }));
	// biome-ignore lint/suspicious/noThenProperty: mock query builder needs .then
	q.then = (onFulfill, onReject) => Promise.resolve(q._resolveValue).then(onFulfill, onReject);
	return q;
};

vi.mock("../../models/proxy_host.js", () => {
	return {
		default: {
			query: vi.fn(() => createMockQuery()),
			relatedQuery: vi.fn(() => ({ where: vi.fn() })),
		},
	};
});

vi.mock("../../models/access_list.js", () => ({
	default: {
		query: vi.fn(() => ({
			where: vi
				.fn()
				.mockReturnValue({ where: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) }),
		})),
	},
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(id) {
			super(`Not Found - ${id}`);
			this.name = "ItemNotFoundError";
			this.status = 404;
		}
	}
	class ValidationError extends Error {
		constructor(m) {
			super(m);
			this.name = "ValidationError";
			this.status = 400;
		}
	}
	class InternalValidationError extends Error {
		constructor(m) {
			super(m);
			this.name = "InternalValidationError";
			this.status = 400;
		}
	}
	return {
		default: { ItemNotFoundError, ValidationError, InternalValidationError },
	};
});

vi.mock("../../lib/utils.js", () => ({
	default: {
		omitRow: () => (row) => row,
		omitRows: () => (rows) => rows,
	},
}));

vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((val) => `encrypted_${val}`),
	decrypt: vi.fn((val) => val.replace("encrypted_", "")),
}));

vi.mock("../../modules/host/index.js", () => ({
	hostService: {
		cleanRowCertificateMeta: vi.fn((row) => row),
		cleanAllRowsCertificateMeta: vi.fn((rows) => rows),
		cleanSslHstsData: vi.fn((_newCert, data) => data),
		isHostnameTaken: vi.fn().mockResolvedValue({ hostname: "test.com", is_taken: false }),
	},
}));

vi.mock("../../modules/nginx/index.js", () => ({
	nginxService: {
		configure: vi.fn().mockResolvedValue({ nginx_online: true }),
		deleteConfig: vi.fn().mockResolvedValue(),
		reload: vi.fn().mockResolvedValue(),
	},
}));

vi.mock("../../modules/audit-log/index.js", () => ({
	auditLogService: { add: vi.fn().mockResolvedValue() },
}));

vi.mock("../../modules/audit-log/service.js", () => ({
	default: { add: vi.fn().mockResolvedValue() },
}));

vi.mock("../../modules/certificate/service.js", () => ({
	default: { createQuickCertificate: vi.fn().mockResolvedValue({ id: 10 }) },
}));

vi.mock("../../modules/git-deploy/service.js", () => ({
	default: { startPollingForHost: vi.fn(), stopPolling: vi.fn() },
}));

vi.mock("../../modules/gitops/service.js", () => ({
	default: { triggerAutoPush: vi.fn() },
}));

vi.mock("../../modules/oauth2-proxy/index.js", () => ({
	oauth2ProxyService: { start: vi.fn(), stop: vi.fn() },
}));

vi.mock("../../logger.js", () => ({
	default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Import helpers (pure functions) directly
import { attachHostDomains, omissions, prepareEncryptedFields } from "../../modules/proxy-host/helpers.js";
import { encrypt } from "../../lib/encryption.js";

describe("proxy-host module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── helpers ──────────────────────────────────────────────────────────

	describe("omissions", () => {
		it("should return expected omission keys", () => {
			const result = omissions();
			expect(result).toContain("is_deleted");
			expect(result).toContain("owner.is_deleted");
		});
	});

	describe("attachHostDomains", () => {
		it("should attach host_domains from domain_names array", () => {
			const data = { domain_names: ["a.com", "b.com"] };
			const result = attachHostDomains(data);
			expect(result.host_domains).toEqual([{ domain_name: "a.com" }, { domain_name: "b.com" }]);
		});

		it("should return data unchanged when domain_names is missing", () => {
			const data = { name: "test" };
			const result = attachHostDomains(data);
			expect(result).toEqual({ name: "test" });
			expect(result.host_domains).toBeUndefined();
		});

		it("should return data unchanged when domain_names is not an array", () => {
			const data = { domain_names: "not-an-array" };
			const result = attachHostDomains(data);
			expect(result.host_domains).toBeUndefined();
		});

		it("should handle empty domain_names array", () => {
			const data = { domain_names: [] };
			const result = attachHostDomains(data);
			expect(result.host_domains).toEqual([]);
		});
	});

	describe("prepareEncryptedFields", () => {
		it("should encrypt terminal_password when forward_scheme is terminal", () => {
			const data = { forward_scheme: "terminal", terminal_password: "secret123" };
			const result = prepareEncryptedFields(data);
			expect(encrypt).toHaveBeenCalledWith("secret123");
			expect(result.terminal_password).toBe("encrypted_secret123");
		});

		it("should encrypt terminal_private_key when present", () => {
			const data = { forward_scheme: "terminal", terminal_private_key: "mykey" };
			const result = prepareEncryptedFields(data);
			expect(result.terminal_private_key).toBe("encrypted_mykey");
		});

		it("should encrypt git_credentials when present", () => {
			const data = { git_credentials: "token123" };
			const result = prepareEncryptedFields(data);
			expect(result.git_credentials).toBe("encrypted_token123");
		});

		it("should delete git_credentials when empty string", () => {
			const data = { git_credentials: "" };
			const result = prepareEncryptedFields(data);
			expect(result.git_credentials).toBeUndefined();
		});

		it("should not modify data without sensitive fields", () => {
			const data = { name: "test", forward_scheme: "https" };
			const result = prepareEncryptedFields(data);
			expect(result.name).toBe("test");
			expect(encrypt).not.toHaveBeenCalled();
		});
	});

	// ── reads ───────────────────────────────────────────────────────────

	describe("getAll", () => {
		it("should return rows for admin visibility", async () => {
			const { getAll } = await import("../../modules/proxy-host/reads.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const rowData = [{ id: 1, access_list_id: "2", count: 3, domain_names: ["a.com"] }];
			const q = createMockQuery(rowData);
			proxyHostModel.query.mockReturnValueOnce(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const result = await getAll(access);
			expect(access.can).toHaveBeenCalledWith("proxy_hosts:list");
			expect(result).toBeDefined();
		});

		it("should filter by owner for non-admin", async () => {
			const { getAll } = await import("../../modules/proxy-host/reads.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const q = createMockQuery([]);
			proxyHostModel.query.mockReturnValueOnce(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "user" }),
				token: { getUserId: () => 5 },
			};
			const _result = await getAll(access);
			expect(q.andWhere).toHaveBeenCalledWith("owner_user_id", 5);
		});

		it("should filter by search query when provided", async () => {
			const { getAll } = await import("../../modules/proxy-host/reads.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const q = createMockQuery([]);
			proxyHostModel.query.mockReturnValueOnce(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await getAll(access, undefined, "test");
			expect(q.whereExists).toHaveBeenCalled();
		});
	});

	describe("getCount", () => {
		it("should return numeric count for admin", async () => {
			const { getCount } = await import("../../modules/proxy-host/reads.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const q = createMockQuery();
			q.first = vi.fn().mockResolvedValue({ count: "7" });
			proxyHostModel.query.mockReturnValueOnce(q);
			const result = await getCount(1, "all");
			expect(result).toBe(7);
			expect(typeof result).toBe("number");
		});

		it("should filter by owner for non-admin", async () => {
			const { getCount } = await import("../../modules/proxy-host/reads.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const q = createMockQuery();
			q.first = vi.fn().mockResolvedValue({ count: "3" });
			proxyHostModel.query.mockReturnValueOnce(q);
			const result = await getCount(5, "user");
			expect(result).toBe(3);
			expect(q.andWhere).toHaveBeenCalledWith("owner_user_id", 5);
		});

		it("should handle zero count", async () => {
			const { getCount } = await import("../../modules/proxy-host/reads.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const q = createMockQuery();
			q.first = vi.fn().mockResolvedValue({ count: "0" });
			proxyHostModel.query.mockReturnValueOnce(q);
			const result = await getCount(1, "all");
			expect(result).toBe(0);
		});
	});

	// ── ensureOAuth2Proxy ───────────────────────────────────────────────

	describe("ensureOAuth2Proxy", () => {
		it("should do nothing when accessListId is falsy", async () => {
			const { ensureOAuth2Proxy } = await import("../../modules/proxy-host/helpers.js");
			const { oauth2ProxyService } = await import("../../modules/oauth2-proxy/index.js");
			await ensureOAuth2Proxy(null);
			expect(oauth2ProxyService.start).not.toHaveBeenCalled();
		});

		it("should start oauth2 proxy when access list has oauth2_proxy auth_type", async () => {
			const { ensureOAuth2Proxy } = await import("../../modules/proxy-host/helpers.js");
			const AccessList = (await import("../../models/access_list.js")).default;
			const { oauth2ProxyService } = await import("../../modules/oauth2-proxy/index.js");
			const listData = { id: 1, meta: { auth_type: "oauth2_proxy" } };
			AccessList.query.mockReturnValueOnce({
				where: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue(listData),
					}),
				}),
			});
			await ensureOAuth2Proxy(1);
			expect(oauth2ProxyService.start).toHaveBeenCalledWith(listData);
		});

		it("should not throw on error (catches internally)", async () => {
			const { ensureOAuth2Proxy } = await import("../../modules/proxy-host/helpers.js");
			const AccessList = (await import("../../models/access_list.js")).default;
			AccessList.query.mockReturnValueOnce({
				where: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						first: vi.fn().mockRejectedValue(new Error("DB error")),
					}),
				}),
			});
			await expect(ensureOAuth2Proxy(1)).resolves.toBeUndefined();
		});
	});

	// ── cleanupOAuth2Proxy ──────────────────────────────────────────────

	describe("cleanupOAuth2Proxy", () => {
		it("should do nothing when accessListId is falsy", async () => {
			const { cleanupOAuth2Proxy } = await import("../../modules/proxy-host/helpers.js");
			const { oauth2ProxyService } = await import("../../modules/oauth2-proxy/index.js");
			await cleanupOAuth2Proxy(0);
			expect(oauth2ProxyService.stop).not.toHaveBeenCalled();
		});

		it("should stop oauth2 proxy when no other hosts use the access list", async () => {
			const { cleanupOAuth2Proxy } = await import("../../modules/proxy-host/helpers.js");
			const AccessList = (await import("../../models/access_list.js")).default;
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const { oauth2ProxyService } = await import("../../modules/oauth2-proxy/index.js");
			AccessList.query.mockReturnValueOnce({
				where: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue({ id: 1, meta: { auth_type: "oauth2_proxy" } }),
					}),
				}),
			});
			proxyHostModel.query.mockReturnValueOnce({
				where: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			});
			await cleanupOAuth2Proxy(1);
			expect(oauth2ProxyService.stop).toHaveBeenCalledWith(1);
		});

		it("should not throw on error", async () => {
			const { cleanupOAuth2Proxy } = await import("../../modules/proxy-host/helpers.js");
			const AccessList = (await import("../../models/access_list.js")).default;
			AccessList.query.mockReturnValueOnce({
				where: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						first: vi.fn().mockRejectedValue(new Error("fail")),
					}),
				}),
			});
			await expect(cleanupOAuth2Proxy(1)).resolves.toBeUndefined();
		});
	});

	// ── lifecycle: remove, enable, disable ──────────────────────────────

	describe("remove", () => {
		it("should mark host as deleted and cleanup", async () => {
			const { remove } = await import("../../modules/proxy-host/lifecycle.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const { nginxService } = await import("../../modules/nginx/index.js");
			const q = createMockQuery({ id: 5, access_list_id: 2, enabled: 1 });
			proxyHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const result = await remove(access, { id: 5 });
			expect(result).toBe(true);
			expect(nginxService.deleteConfig).toHaveBeenCalled();
			expect(nginxService.reload).toHaveBeenCalled();
		});

		it("should check permissions before deleting", async () => {
			const { remove } = await import("../../modules/proxy-host/lifecycle.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const q = createMockQuery({ id: 5, access_list_id: 0 });
			proxyHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await remove(access, { id: 5 });
			expect(access.can).toHaveBeenCalledWith("proxy_hosts:delete", 5);
		});
	});

	describe("enable", () => {
		it("should enable a disabled host", async () => {
			const { enable } = await import("../../modules/proxy-host/lifecycle.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const { nginxService } = await import("../../modules/nginx/index.js");
			const q = createMockQuery({ id: 3, enabled: 0, access_list_id: 0 });
			proxyHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const result = await enable(access, { id: 3 });
			expect(result).toBe(true);
			expect(nginxService.configure).toHaveBeenCalled();
		});

		it("should throw if host is already enabled", async () => {
			const { enable } = await import("../../modules/proxy-host/lifecycle.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const q = createMockQuery({ id: 3, enabled: 1, access_list_id: 0 });
			proxyHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await expect(enable(access, { id: 3 })).rejects.toThrow("already enabled");
		});
	});

	describe("disable", () => {
		it("should disable an enabled host", async () => {
			const { disable } = await import("../../modules/proxy-host/lifecycle.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const { nginxService } = await import("../../modules/nginx/index.js");
			const q = createMockQuery({ id: 3, enabled: 1, access_list_id: 0 });
			proxyHostModel.query.mockReturnValue(q);
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
			const { disable } = await import("../../modules/proxy-host/lifecycle.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const q = createMockQuery({ id: 3, enabled: 0, access_list_id: 0 });
			proxyHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await expect(disable(access, { id: 3 })).rejects.toThrow("already disabled");
		});
	});

	// ── mutations: create, update ───────────────────────────────────────

	describe("create", () => {
		it("should create a proxy host and configure nginx", async () => {
			const { create } = await import("../../modules/proxy-host/mutations.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const { nginxService } = await import("../../modules/nginx/index.js");
			const { hostService } = await import("../../modules/host/index.js");
			hostService.isHostnameTaken.mockResolvedValue({ hostname: "test.com", is_taken: false });
			const q = createMockQuery({ id: 1, domain_names: ["test.com"], access_list_id: 0, meta: {} });
			q.insertGraphAndFetch = vi.fn().mockResolvedValue({ id: 1 });
			proxyHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const data = {
				domain_names: ["test.com"],
				forward_scheme: "https",
				forward_host: "localhost",
				forward_port: 3000,
			};
			const result = await create(access, data);
			expect(result).toBeDefined();
			expect(nginxService.configure).toHaveBeenCalled();
		});

		it("should throw ValidationError if domain is taken", async () => {
			const { create } = await import("../../modules/proxy-host/mutations.js");
			const { hostService } = await import("../../modules/host/index.js");
			hostService.isHostnameTaken.mockResolvedValue({ hostname: "taken.com", is_taken: true });
			const access = {
				can: vi.fn().mockResolvedValue({}),
				token: { getUserId: () => 1 },
			};
			const data = { domain_names: ["taken.com"] };
			await expect(create(access, data)).rejects.toThrow("already in use");
		});
	});

	describe("update", () => {
		it("should update a proxy host", async () => {
			const { update } = await import("../../modules/proxy-host/mutations.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const { nginxService } = await import("../../modules/nginx/index.js");
			const q = createMockQuery({ id: 1, domain_names: ["old.com"], access_list_id: 0, meta: {} });
			q.upsertGraphAndFetch = vi.fn().mockResolvedValue({ id: 1 });
			proxyHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			const result = await update(access, { id: 1, forward_host: "newhost" });
			expect(result).toBeDefined();
			expect(nginxService.configure).toHaveBeenCalled();
		});

		it("should throw when IDs do not match", async () => {
			const { update } = await import("../../modules/proxy-host/mutations.js");
			const proxyHostModel = (await import("../../models/proxy_host.js")).default;
			const q = createMockQuery({ id: 99, domain_names: ["x.com"], access_list_id: 0 });
			proxyHostModel.query.mockReturnValue(q);
			const access = {
				can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
				token: { getUserId: () => 1 },
			};
			await expect(update(access, { id: 1 })).rejects.toThrow("IDs do not match");
		});
	});
});
