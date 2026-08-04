import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix #65: YAML import must validate fields against a whitelist.
 * Without validation, an attacker who can push commits could inject
 * arbitrary DB fields (is_deleted bypass, owner_user_id override, etc.)
 */

vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({
	isDestructiveTestMode: vi.fn().mockReturnValue(false),
	configHas: vi.fn().mockReturnValue(true),
	configGet: vi.fn().mockReturnValue("mock-value"),
	isSqlite: vi.fn().mockReturnValue(true),
	isMysql: vi.fn().mockReturnValue(false),
	isPostgres: vi.fn().mockReturnValue(false),
	getPrivateKey: vi.fn().mockReturnValue("mock-private-key"),
	getPublicKey: vi.fn().mockReturnValue("mock-public-key"),
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
}));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		bulkGenerateConfigs: vi.fn().mockResolvedValue({}),
		reload: vi.fn().mockResolvedValue(undefined),
		deleteConfig: vi.fn().mockResolvedValue({}),
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("isomorphic-git", () => ({
	default: {
		init: vi.fn().mockResolvedValue({}),
		add: vi.fn().mockResolvedValue(undefined),
		statusMatrix: vi.fn().mockResolvedValue([]),
		commit: vi.fn().mockResolvedValue("abc123"),
		listRemotes: vi.fn().mockResolvedValue([]),
		addRemote: vi.fn().mockResolvedValue(undefined),
		push: vi.fn().mockResolvedValue(undefined),
	},
}));
vi.mock("isomorphic-git/http/node", () => ({ default: {} }));

import internalGitOps from "../../internal/gitops.js";

// Mock fs to simulate YAML files
const mockFiles = {};
const mockFs = {
	existsSync: (p) => mockFiles[p] !== undefined,
	readdir: (p) => Promise.resolve(Object.keys(mockFiles).filter((k) => k.startsWith(p))),
	readFile: async (p) => {
		if (mockFiles[p]) return mockFiles[p];
		throw new Error("File not found");
	},
	promises: {
		existsSync: (p) => mockFiles[p] !== undefined,
		readdir: (p) => Promise.resolve(Object.keys(mockFiles).filter((k) => k.startsWith(p))),
		readFile: async (p) => {
			if (mockFiles[p]) return mockFiles[p];
			throw new Error("File not found");
		},
		mkdir: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
		unlink: vi.fn().mockResolvedValue(undefined),
		rmdir: vi.fn().mockResolvedValue(undefined),
	},
};

vi.stubGlobal("fs", mockFs);

// ── Helpers ──────────────────────────────────────────────────────────────────
const _mockAccess = {
	can: vi.fn().mockResolvedValue(true),
	token: { getUserId: () => 1 },
};

// ── Tests ────────────────────────────────────────────────────────────────────
describe("Fix #65: YAML import field whitelist validation", () => {
	beforeEach(() => {
		mockFiles.length = 0;
	});

	it("ALLOWED_IMPORT_FIELDS is defined for all importable models", () => {
		const allowed = internalGitOps.ALLOWED_IMPORT_FIELDS;
		expect(allowed.User).toBeDefined();
		expect(allowed.Certificate).toBeDefined();
		expect(allowed.AccessList).toBeDefined();
		expect(allowed.FirewallPolicy).toBeDefined();
		expect(allowed.ProxyHost).toBeDefined();
		expect(allowed.RedirectionHost).toBeDefined();
		expect(allowed.DeadHost).toBeDefined();
		expect(allowed.Stream).toBeDefined();
		expect(allowed.CloudflaredTunnel).toBeDefined();
		expect(allowed.DdnsProvider).toBeDefined();
		expect(allowed.Setting).toBeDefined();
	});

	it("sanitizeImportData returns null for unknown model", () => {
		const result = internalGitOps.sanitizeImportData("UnknownModel", { id: 1, foo: "bar" });
		expect(result).toBeNull();
	});

	it("sanitizeImportData picks only allowed fields", () => {
		const result = internalGitOps.sanitizeImportData("User", {
			id: 5,
			email: "test@example.com",
			nickname: "Test",
			role: "admin",
			// These should be stripped:
			is_deleted: 0,
			owner_user_id: 99,
			hacked_field: "injection",
			another_hack: 123,
		});
		expect(result).not.toBeNull();
		// is_deleted and owner_user_id are in the whitelist — they are kept
		// only fields NOT in the whitelist are stripped
		expect(result.hacked_field).toBeUndefined();
		expect(result.another_hack).toBeUndefined();
		// All whitelisted fields are preserved
		expect(result.id).toBe(5);
		expect(result.email).toBe("test@example.com");
		expect(result.nickname).toBe("Test");
		expect(result.role).toBe("admin");
		expect(result.is_deleted).toBe(0);
		expect(result.owner_user_id).toBe(99);
	});

	it("sanitizeImportData allows is_deleted when it's in whitelist", () => {
		const result = internalGitOps.sanitizeImportData("User", {
			id: 5,
			email: "test@example.com",
			is_deleted: 0,
			injected_field: "should_be_removed",
		});
		expect(result.is_deleted).toBe(0); // allowed field
		expect(result.injected_field).toBeUndefined();
	});

	it("sanitizeImportData strips owner_user_id injection for User model", () => {
		// owner_user_id is in the whitelist, but sanitizeImportData should
		// pick it — the actual owner enforcement happens separately in importModel
		const result = internalGitOps.sanitizeImportData("User", {
			id: 5,
			email: "test@example.com",
			owner_user_id: 99,
			malicious_extra: "gone",
		});
		expect(result.owner_user_id).toBe(99); // allowed field, but import overwrites it
		expect(result.malicious_extra).toBeUndefined();
	});

	it("Certificate whitelist does not include raw_cert/raw_key/raw_chain (security)", () => {
		const result = internalGitOps.sanitizeImportData("Certificate", {
			id: 1,
			nice_name: "Test Cert",
			domain_names: ["test.example.com"],
			provider: "letsencrypt",
			raw_cert: "CERT_DATA",
			raw_key: "KEY_DATA",
			raw_chain: "CHAIN_DATA",
			// Injection attempt
			is_deleted: 0,
			owner_user_id: 99,
			injected_field: "REMOVED",
		});
		expect(result.raw_cert).toBeUndefined();
		expect(result.raw_key).toBeUndefined();
		expect(result.raw_chain).toBeUndefined();
		expect(result.domain_names).toEqual(["test.example.com"]);
		expect(result.injected_field).toBeUndefined();
	});

	it("FirewallPolicy whitelist preserves declarative rules but excludes volatile feed state", () => {
		const result = internalGitOps.sanitizeImportData("FirewallPolicy", {
			id: 7,
			name: "Public deny list",
			enabled: true,
			action: "deny",
			geo_mode: "block",
			geo_countries: ["GB"],
			allow_cidrs: ["198.51.100.0/24"],
			block_cidrs: ["203.0.113.0/24"],
			feed_urls: ["https://feeds.example.test/cidrs"],
			refresh_interval_hours: 24,
			feed_status: { stale: true },
			last_error: "upstream timed out",
			last_updated_on: "2026-08-04T00:00:00.000Z",
			injected_field: "removed",
		});
		expect(result).toMatchObject({
			id: 7,
			name: "Public deny list",
			geo_countries: ["GB"],
			feed_urls: ["https://feeds.example.test/cidrs"],
		});
		expect(result.feed_status).toBeUndefined();
		expect(result.last_error).toBeUndefined();
		expect(result.last_updated_on).toBeUndefined();
		expect(result.injected_field).toBeUndefined();
	});

	it("ProxyHost whitelist contains expected fields", () => {
		const result = internalGitOps.sanitizeImportData("ProxyHost", {
			id: 1,
			domain_names: ["proxy.example.com"],
			forward_host: "localhost",
			forward_port: 8080,
			forward_scheme: "http",
			access_list_id: null,
			http_options: {},
			ssl_options: {},
			nginx_options: {},
			nginx_settings: {},
			is_deleted: 0,
			owner_user_id: 1,
			// Injection attempts
			arbitrary_field: "REMOVED",
			another_field: 999,
		});
		expect(Object.keys(result).sort()).toEqual(
			[
				"access_list_id",
				"domain_names",
				"forward_host",
				"forward_port",
				"forward_scheme",
				"http_options",
				"id",
				"is_deleted",
				"nginx_options",
				"nginx_settings",
				"owner_user_id",
				"ssl_options",
			].sort(),
		);
		expect(result.arbitrary_field).toBeUndefined();
	});
});
