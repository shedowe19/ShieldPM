import { beforeEach, describe, expect, it, vi } from "vitest";

const patches = [];
let storedMeta;

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
vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((value) => `encrypted:${value}`),
	decrypt: vi.fn((value) => value.replace("encrypted:", "")),
}));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("isomorphic-git", () => ({ default: {} }));
vi.mock("isomorphic-git/http/node", () => ({ default: { request: vi.fn() } }));
vi.mock("../../models/setting.js", () => ({
	default: {
		query: () => ({
			where: () => ({
				first: async () => ({
					id: "gitops-config",
					value: storedMeta.enabled ? "enabled" : "disabled",
					meta: storedMeta,
				}),
				patch: async (patch) => {
					patches.push(patch);
					if (patch.meta) storedMeta = patch.meta;
					return 1;
				},
			}),
		}),
	},
}));

import internalGitOps from "../../internal/gitops.js";

const access = { can: vi.fn().mockResolvedValue(true) };

describe("GitOps credential projection and revocation", () => {
	beforeEach(() => {
		patches.length = 0;
		storedMeta = {
			enabled: false,
			repository_url: "https://github.com/example/config.git",
			branch: "main",
			auth_type: "https",
			encrypted_credentials: "encrypted:secret-pat",
			auto_push: false,
			auto_pull_on_startup: false,
			last_sync: null,
			last_error: null,
		};
		access.can.mockClear();
	});

	it("returns an explicit public projection without ciphertext or a redaction placeholder", async () => {
		const config = await internalGitOps.getConfig();
		expect(config.has_credentials).toBe(true);
		expect(config).not.toHaveProperty("encrypted_credentials");
		expect(JSON.stringify(config)).not.toContain("secret-pat");
	});

	it("treats an explicitly empty credential as revocation", async () => {
		await internalGitOps.updateConfig(access, { credentials: "" });
		expect(access.can).toHaveBeenCalledWith("settings:update", "gitops-config");
		expect(storedMeta.encrypted_credentials).toBe("");
		expect((await internalGitOps.getConfig()).has_credentials).toBe(false);
	});

	it("rejects SSH and credential-bearing repository URLs", async () => {
		await expect(internalGitOps.updateConfig(access, { auth_type: "ssh" })).rejects.toThrow("HTTPS/PAT");
		await expect(
			internalGitOps.updateConfig(access, { repository_url: "https://user:token@example.com/config.git" }),
		).rejects.toThrow("embedded credentials");
	});
});
