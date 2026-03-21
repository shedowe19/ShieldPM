import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
	default: {
		existsSync: vi.fn(() => false),
		promises: {
			mkdir: vi.fn().mockResolvedValue(),
			readFile: vi.fn().mockResolvedValue(""),
			writeFile: vi.fn().mockResolvedValue(),
			readdir: vi.fn().mockResolvedValue([]),
			stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
			rmdir: vi.fn().mockResolvedValue(),
			unlink: vi.fn().mockResolvedValue(),
			copyFile: vi.fn().mockResolvedValue(),
		},
	},
	existsSync: vi.fn(() => false),
}));

vi.mock("node:path", () => ({
	default: { join: vi.fn((...args) => args.join("/")) },
	join: vi.fn((...args) => args.join("/")),
}));

vi.mock("isomorphic-git", () => ({
	default: {
		init: vi.fn().mockResolvedValue(),
		add: vi.fn().mockResolvedValue(),
		commit: vi.fn().mockResolvedValue("abc123"),
		push: vi.fn().mockResolvedValue(),
		pull: vi.fn().mockResolvedValue(),
		log: vi.fn().mockResolvedValue([]),
		listRemotes: vi.fn().mockResolvedValue([]),
		addRemote: vi.fn().mockResolvedValue(),
		deleteRemote: vi.fn().mockResolvedValue(),
		statusMatrix: vi.fn().mockResolvedValue([]),
		getRemoteInfo: vi.fn().mockResolvedValue({ HEAD: "main" }),
		checkout: vi.fn().mockResolvedValue(),
	},
}));

vi.mock("isomorphic-git/http/node", () => ({ default: {} }));

vi.mock("js-yaml", () => ({
	default: {
		dump: vi.fn((obj) => JSON.stringify(obj)),
		load: vi.fn((str) => JSON.parse(str)),
	},
}));

vi.mock("../../lib/config.js", () => ({
	isDemoMode: vi.fn(() => false),
}));

vi.mock("../../lib/encryption.js", () => ({
	decrypt: vi.fn((v) => `decrypted-${v}`),
	encrypt: vi.fn((v) => `encrypted-${v}`),
}));

vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor(id) { super(`Not Found - ${id}`); this.name = "ItemNotFoundError"; }
	}
	class AuthError extends Error {
		constructor(m) { super(m); this.name = "AuthError"; }
	}
	return { default: { ItemNotFoundError, AuthError } };
});

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../models/setting.js", () => ({
	default: {
		query: vi.fn(() => mockSettingQuery),
	},
}));

vi.mock("../../models/proxy_host.js", () => ({ default: { query: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } }));
vi.mock("../../models/redirection_host.js", () => ({ default: { query: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } }));
vi.mock("../../models/dead_host.js", () => ({ default: { query: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } }));
vi.mock("../../models/stream.js", () => ({ default: { query: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } }));
vi.mock("../../models/certificate.js", () => ({ default: { query: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } }));
vi.mock("../../models/user.js", () => ({ default: { query: vi.fn(() => ({ where: vi.fn().mockReturnThis(), withGraphFetched: vi.fn().mockResolvedValue([]) })) } }));
vi.mock("../../models/access_list.js", () => ({ default: { query: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } }));
vi.mock("../../models/cloudflared_tunnel.js", () => ({ default: { query: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } }));
vi.mock("../../models/ddns_provider.js", () => ({ default: { query: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } }));

vi.mock("../../modules/nginx/index.js", () => ({
	nginxService: {
		bulkGenerateConfigs: vi.fn().mockResolvedValue(),
		deleteConfig: vi.fn().mockResolvedValue(),
		reload: vi.fn().mockResolvedValue(),
	},
}));

const mockSettingQuery = {
	where: vi.fn().mockReturnThis(),
	first: vi.fn().mockResolvedValue({
		id: "gitops-config",
		meta: {
			enabled: true,
			repository_url: "https://github.com/test/repo.git",
			branch: "main",
			encrypted_credentials: "enc-token",
			auto_push: false,
			auto_pull_on_startup: false,
		},
	}),
	patch: vi.fn().mockResolvedValue(1),
	findById: vi.fn().mockResolvedValue(null),
	whereNot: vi.fn().mockResolvedValue([]),
	insert: vi.fn().mockResolvedValue({}),
	patchAndFetchById: vi.fn().mockResolvedValue({}),
};

import { sanitizeForExport } from "../../modules/gitops/exporter.js";
import { GITOPS_DIR, CONFIG_SUBDIR, getConfigDir } from "../../modules/gitops/helpers.js";

describe("gitops module", () => {
	beforeEach(() => vi.clearAllMocks());

	describe("constants", () => {
		it("should have correct GITOPS_DIR", () => {
			expect(GITOPS_DIR).toBe("/data/gitops");
		});

		it("should have correct CONFIG_SUBDIR", () => {
			expect(CONFIG_SUBDIR).toBe("shieldpm-config");
		});

		it("should compute config dir", () => {
			const dir = getConfigDir();
			expect(dir).toContain("shieldpm-config");
		});
	});

	describe("sanitizeForExport", () => {
		it("should remove specified fields", () => {
			const obj = { id: 1, name: "test", secret: "hidden", is_deleted: 0 };
			const result = sanitizeForExport(obj, ["secret", "is_deleted"]);
			expect(result).toEqual({ id: 1, name: "test" });
		});

		it("should return copy without mutation", () => {
			const obj = { a: 1, b: 2 };
			const result = sanitizeForExport(obj, ["b"]);
			expect(obj.b).toBe(2);
			expect(result.b).toBeUndefined();
		});

		it("should handle empty exclude list", () => {
			const obj = { id: 1, name: "test" };
			const result = sanitizeForExport(obj, []);
			expect(result).toEqual({ id: 1, name: "test" });
		});

		it("should handle non-existent fields in exclude", () => {
			const obj = { id: 1 };
			const result = sanitizeForExport(obj, ["nonexistent"]);
			expect(result).toEqual({ id: 1 });
		});
	});
});
