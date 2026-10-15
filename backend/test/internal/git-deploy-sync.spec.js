import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	exists: vi.fn(),
	rm: vi.fn(),
	clone: vi.fn(),
	pull: vi.fn(),
	currentBranch: vi.fn(),
	getConfig: vi.fn(),
	query: vi.fn(),
	host: {},
	patch: vi.fn(),
	configure: vi.fn(),
}));
vi.mock("node:fs", () => ({
	default: {
		existsSync: mocks.exists,
		mkdirSync: vi.fn(),
		mkdtempSync: (prefix) => `${prefix}test`,
		statSync: () => ({ mode: 0o755 }),
		chmodSync: vi.fn(),
		renameSync: vi.fn(),
		rmSync: mocks.rm,
	},
}));
vi.mock("isomorphic-git", () => ({
	default: {
		clone: mocks.clone,
		pull: mocks.pull,
		currentBranch: mocks.currentBranch,
		getConfig: mocks.getConfig,
		log: async () => [{ oid: "latest" }],
	},
}));
vi.mock("isomorphic-git/http/node", () => ({ default: {} }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.query } }));
vi.mock("../../internal/nginx.js", () => ({
	default: { withConfigurationLock: (callback) => callback(), configureHost: mocks.configure },
}));

import gitDeploy from "../../internal/git-deploy.js";

describe("Git Deploy synchronization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.host = {
			id: 7,
			forward_scheme: "path",
			forward_host: "/data/websites/host-7",
			git_repo_url: "https://git.example/new.git",
			git_branch: "main",
		};
		mocks.query.mockImplementation(() => {
			const query = {
				findById: () => query,
				where: () => query,
				withGraphFetched: () => query,
				patch: mocks.patch,
				// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
				then: (resolve) => Promise.resolve(mocks.host).then(resolve),
			};
			return query;
		});
		mocks.patch.mockImplementation(async (patch) => Object.assign(mocks.host, patch));
		mocks.configure.mockResolvedValue({ nginx_online: true });
		mocks.clone.mockResolvedValue();
		mocks.currentBranch.mockResolvedValue("main");
		mocks.getConfig.mockResolvedValue("https://git.example/old.git");
		mocks.exists.mockImplementation(() => true);
		mocks.rm.mockImplementation(() => mocks.exists.mockImplementation((path) => !path.endsWith("/.git")));
	});
	afterEach(() => gitDeploy.stopAllPolling());
	it("re-clones when the repository URL changes even if the branch is unchanged", async () => {
		expect(await gitDeploy.sync(null, 7)).toMatchObject({ success: true });
		expect(mocks.clone).toHaveBeenCalledWith(expect.objectContaining({ url: "https://git.example/new.git" }));
		expect(mocks.pull).not.toHaveBeenCalled();
	});
	it("shares concurrent syncs instead of cloning over the same directory twice", async () => {
		let release;
		mocks.clone.mockImplementation(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const first = gitDeploy.sync(null, 7);
		const second = gitDeploy.sync(null, 7);
		await vi.waitFor(() => expect(mocks.clone).toHaveBeenCalledTimes(1));
		release();
		await expect(first).resolves.toMatchObject({ success: true });
		await expect(second).resolves.toMatchObject({ success: true });
	});
	it.each(["deleted", "changed"])(
		"does not apply a checkout when the host was %s during the network request",
		async (state) => {
			let release;
			mocks.clone.mockImplementation(
				() =>
					new Promise((resolve) => {
						release = resolve;
					}),
			);
			const pending = gitDeploy.sync(null, 7);
			await vi.waitFor(() => expect(mocks.clone).toHaveBeenCalledOnce());
			mocks.host =
				state === "deleted"
					? undefined
					: { ...mocks.host, git_repo_url: "https://git.example/changed-again.git" };
			release();
			await expect(pending).resolves.toMatchObject({ success: false });
			expect(mocks.patch).not.toHaveBeenCalled();
		},
	);
	it("persists failed activation and retries the already stored root on the next sync", async () => {
		mocks.host.forward_host = "/var/www/old";
		mocks.host.enabled = true;
		mocks.configure.mockResolvedValueOnce({ nginx_online: false, nginx_err: "Nginx rejected root" });
		await expect(gitDeploy.sync(null, 7)).resolves.toMatchObject({
			success: false,
			message: "Nginx rejected root",
		});
		expect(mocks.host.forward_host).toBe("/data/websites/host-7");
		expect(mocks.host.git_last_error).toBe("Nginx rejected root");
		expect(mocks.configure).toHaveBeenCalledOnce();

		await expect(gitDeploy.sync(null, 7)).resolves.toMatchObject({ success: true });
		expect(mocks.configure).toHaveBeenCalledTimes(2);
		expect(mocks.host.git_last_error).toBeNull();
	});
	it("retries a durable pending activation after a process interruption", async () => {
		mocks.host.enabled = true;
		mocks.host.git_last_error = "Nginx activation pending";
		await expect(gitDeploy.sync(null, 7)).resolves.toMatchObject({ success: true });
		expect(mocks.configure).toHaveBeenCalledOnce();
		expect(mocks.host.git_last_error).toBeNull();
	});
});
