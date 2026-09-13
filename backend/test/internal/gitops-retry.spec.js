import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ directory: "", push: vi.fn(), pull: vi.fn(), patch: vi.fn() }));
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn(), decrypt: () => "new-token" }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../models/setting.js", () => ({
	default: { query: () => ({ where: () => ({ patch: mocks.patch }) }) },
}));
vi.mock("isomorphic-git", async (importOriginal) => {
	const { default: actual } = await importOriginal();
	return {
		default: {
			...actual,
			...Object.fromEntries(
				["add", "remove", "statusMatrix", "commit", "addRemote", "currentBranch"].map((method) => [
					method,
					(options) => actual[method]({ ...options, dir: mocks.directory }),
				]),
			),
			push: mocks.push,
			pull: mocks.pull,
		},
	};
});

import internalGitOps from "../../internal/gitops.js";

const { default: git } = await vi.importActual("isomorphic-git");

describe("GitOps tracked deletions and remote retries", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-gitops-retry-"));
		await git.init({ fs, dir: mocks.directory, defaultBranch: "main" });
		vi.spyOn(internalGitOps, "initRepo").mockResolvedValue();
		vi.spyOn(internalGitOps, "getConfigInternal").mockResolvedValue({
			enabled: true,
			repository_url: "https://new.example/config.git",
			branch: "main",
			auth_type: "https",
			encrypted_credentials: "encrypted-token",
		});
		mocks.patch.mockResolvedValue(1);
		mocks.push.mockResolvedValue();
		mocks.pull.mockResolvedValue();
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.promises.rm(mocks.directory, { recursive: true, force: true });
	});
	it("retries a failed push of an already committed configuration", async () => {
		await fs.promises.writeFile(path.join(mocks.directory, "host.yaml"), "id: 7");
		mocks.push.mockRejectedValueOnce(new Error("Remote temporarily unavailable"));
		expect(await internalGitOps.commitAndPush("configuration")).toMatchObject({ success: false });
		const before = await git.resolveRef({ fs, dir: mocks.directory, ref: "HEAD" });
		expect(await internalGitOps.commitAndPush("retry")).toMatchObject({ success: true });
		expect(mocks.push).toHaveBeenCalledTimes(2);
		expect(await git.resolveRef({ fs, dir: mocks.directory, ref: "HEAD" })).toBe(before);
	});
	it("removes deleted YAML files from the committed tree", async () => {
		const file = path.join(mocks.directory, "host.yaml");
		await fs.promises.writeFile(file, "id: 7");
		expect(await internalGitOps.commitAndPush("create")).toMatchObject({ success: true });
		await fs.promises.unlink(file);
		expect(await internalGitOps.commitAndPush("delete")).toMatchObject({ success: true });
		expect(await git.listFiles({ fs, dir: mocks.directory, ref: "HEAD" })).toEqual([]);
	});
	it("changes origin before pulling with credentials for the new repository", async () => {
		await git.addRemote({ fs, dir: mocks.directory, remote: "origin", url: "https://old.example/config.git" });
		mocks.pull.mockImplementation(async (options) => {
			expect(await git.getConfig({ fs, dir: mocks.directory, path: "remote.origin.url" })).toBe(
				"https://new.example/config.git",
			);
			expect(options.onAuth()).toEqual({ username: "git", password: "new-token" });
		});
		expect(await internalGitOps.pull()).toMatchObject({ success: true });
		expect(mocks.pull).toHaveBeenCalledOnce();
	});
	it("pushes the current local commit to a configured remote branch even when the local branch differs", async () => {
		internalGitOps.getConfigInternal.mockResolvedValue({
			enabled: true,
			repository_url: "https://new.example/config.git",
			branch: "backup",
		});
		await fs.promises.writeFile(path.join(mocks.directory, "host.yaml"), "id: 7");
		expect(await internalGitOps.commitAndPush("backup")).toMatchObject({ success: true });
		expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ ref: "HEAD", remoteRef: "backup" }));
	});
});
