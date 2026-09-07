import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ meta: {}, patches: [], push: vi.fn(), pull: vi.fn() }));
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({
	isDemoMode: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("isomorphic-git", () => ({
	default: {
		add: vi.fn(),
		statusMatrix: vi.fn().mockResolvedValue([["host.yaml", 1, 2, 2]]),
		commit: vi.fn().mockResolvedValue("abc123"),
		addRemote: vi.fn(),
		currentBranch: vi.fn().mockResolvedValue("main"),
		push: mocks.push,
		pull: mocks.pull,
	},
}));
vi.mock("isomorphic-git/http/node", () => ({ default: {} }));
vi.mock("../../models/setting.js", () => ({
	default: {
		query: () => ({
			where: () => ({
				first: async () => ({ id: "gitops-config", meta: { ...mocks.meta } }),
				patch: async (data) => {
					mocks.patches.push(data);
					// Setting.meta is the JSON column: flat last_sync/last_error columns do not exist.
					if (data.meta) mocks.meta = { ...data.meta };
					return 1;
				},
			}),
		}),
	},
}));

import internalGitOps from "../../internal/gitops.js";
import { decrypt, encrypt } from "../../lib/encryption.js";

describe("GitOps sync metadata preserves encrypted credentials", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.patches.length = 0;
		mocks.meta = {
			enabled: true,
			repository_url: "https://example.com/config.git",
			branch: "main",
			auth_type: "https",
			encrypted_credentials: encrypt("original-token"),
			auto_push: true,
			last_error: "previous error",
		};
		mocks.push.mockResolvedValue();
		mocks.pull.mockResolvedValue();
		vi.spyOn(internalGitOps, "initRepo").mockResolvedValue();
	});
	afterEach(() => vi.restoreAllMocks());
	it.each(["commitAndPush", "pull"])(
		"%s stores metadata in the JSON column without persisting public redaction",
		async (method) => {
			const ciphertext = mocks.meta.encrypted_credentials;
			expect((await internalGitOps.getConfig()).encrypted_credentials).toBe("[REDACTED]");
			expect(await internalGitOps[method]("test commit")).toMatchObject({ success: true });
			expect(mocks.patches).toHaveLength(1);
			expect(Object.keys(mocks.patches[0])).toEqual(["meta"]);
			expect(mocks.meta).toMatchObject({ encrypted_credentials: ciphertext, auto_push: true, last_error: null });
			expect(Number.isNaN(Date.parse(mocks.meta.last_sync))).toBe(false);
			expect(decrypt(mocks.meta.encrypted_credentials)).toBe("original-token");
		},
	);
	it("keeps credentials rotated while a push is in flight", async () => {
		const rotated = encrypt("rotated-token");
		mocks.push.mockImplementation(async () => {
			mocks.meta = { ...mocks.meta, encrypted_credentials: rotated, auto_push: false };
		});
		expect(await internalGitOps.commitAndPush("test commit")).toMatchObject({ success: true });
		expect(mocks.meta).toMatchObject({ encrypted_credentials: rotated, auto_push: false, last_error: null });
		expect(decrypt(mocks.meta.encrypted_credentials)).toBe("rotated-token");
	});
	it("retains ciphertext and the prior successful sync when recording a push failure", async () => {
		const ciphertext = mocks.meta.encrypted_credentials;
		mocks.meta.last_sync = "2026-01-01T00:00:00.000Z";
		mocks.push.mockRejectedValue(new Error("temporary network failure"));
		expect(await internalGitOps.commitAndPush("test commit")).toMatchObject({ success: false });
		expect(mocks.meta).toMatchObject({
			encrypted_credentials: ciphertext,
			last_error: "temporary network failure",
			last_sync: "2026-01-01T00:00:00.000Z",
		});
		expect(decrypt(mocks.meta.encrypted_credentials)).toBe("original-token");
	});
});
