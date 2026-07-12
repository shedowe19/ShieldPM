import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix #66: commitAndPush and pull must not spread the full config object
 * into a meta patch. Spreading config (which may contain "[REDACTED]" if
 * getConfig() was used) would overwrite encrypted_credentials permanently.
 */

// Track all patch calls
const patches = [];

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
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
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

vi.mock("../../models/setting.js", () => ({
	default: {
		query: () => ({
			where: () => ({
				patch: (data) => {
					patches.push(data);
					return Promise.resolve(1);
				},
				first: vi.fn().mockResolvedValue({
					id: "gitops-config",
					meta: {
						enabled: true,
						repository_url: "https://github.com/test/test.git",
						branch: "main",
						auth_type: "https",
						encrypted_credentials: "real_encrypted_cred",
					},
				}),
			}),
		}),
	},
}));

import internalGitOps from "../../internal/gitops.js";

const mockAccess = {
	can: vi.fn().mockResolvedValue(true),
	token: { getUserId: () => 1 },
};

describe("Fix #66: No credential overwrite via config spread in patch calls", () => {
	let initRepo;

	beforeEach(() => {
		initRepo = vi.spyOn(internalGitOps, "initRepo").mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("encrypted_credentials must never appear as a key in any patch call", async () => {
		patches.length = 0;
		await internalGitOps.commitAndPush(mockAccess, "test commit");
		expect(initRepo).toHaveBeenCalledOnce();
		for (const patch of patches) {
			expect(Object.keys(patch)).not.toContain("encrypted_credentials");
		}
		// No patch should wrap data in a 'meta' key that spreads config
		const metaPatches = patches.filter((p) => p.meta !== undefined);
		expect(metaPatches).toHaveLength(0);
	});

	it("patches must use flat fields (last_sync, last_error) — never a meta object with config spread", async () => {
		patches.length = 0;
		await internalGitOps.commitAndPush(mockAccess, "test commit");
		for (const patch of patches) {
			if (patches.indexOf(patch) === patches.length - 1) {
				// Last patch should have last_sync and last_error
				expect(patch.last_sync).toBeDefined();
				expect(patch.last_error).toBeNull();
			}
		}
	});
});
