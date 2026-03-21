import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("lodash", () => ({
	default: {
		assign: Object.assign,
		omit: (obj, keys) => {
			const result = { ...obj };
			keys.forEach((k) => delete result[k]);
			return result;
		},
	},
}));

// Mock all dependencies before imports
vi.mock("../../models/proxy_host.js", () => {
	const mockQuery = {
		where: vi.fn().mockReturnThis(),
		andWhere: vi.fn().mockReturnThis(),
		allowGraph: vi.fn().mockReturnThis(),
		withGraphFetched: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(null),
		groupBy: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		whereExists: vi.fn().mockReturnThis(),
		count: vi.fn().mockReturnThis(),
		patch: vi.fn().mockResolvedValue(1),
		insertGraphAndFetch: vi.fn().mockResolvedValue({ id: 1 }),
		upsertGraphAndFetch: vi.fn().mockResolvedValue({ id: 1 }),
	};
	return {
		default: {
			query: vi.fn(() => ({ ...mockQuery })),
			relatedQuery: vi.fn(() => ({ where: vi.fn() })),
		},
	};
});

vi.mock("../../models/access_list.js", () => ({
	default: { query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), first: vi.fn() })) },
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

vi.mock("../audit-log/service.js", () => ({
	default: { add: vi.fn().mockResolvedValue() },
}));

vi.mock("../certificate/service.js", () => ({
	default: { createQuickCertificate: vi.fn().mockResolvedValue({ id: 10 }) },
}));

vi.mock("../git-deploy/service.js", () => ({
	default: { startPollingForHost: vi.fn(), stopPolling: vi.fn() },
}));

vi.mock("../gitops/service.js", () => ({
	default: { triggerAutoPush: vi.fn() },
}));

vi.mock("../../modules/oauth2-proxy/index.js", () => ({
	oauth2ProxyService: { start: vi.fn(), stop: vi.fn() },
}));

vi.mock("../../logger.js", () => ({
	default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
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
			expect(result.host_domains).toEqual([
				{ domain_name: "a.com" },
				{ domain_name: "b.com" },
			]);
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
});
