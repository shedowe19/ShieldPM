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
}));
vi.mock("node:fs", () => ({ default: { existsSync: mocks.exists, mkdirSync: vi.fn(), rmSync: mocks.rm } }));
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
vi.mock("../../internal/nginx.js", () => ({ default: {} }));

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
				patch: mocks.patch,
				// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
				then: (resolve) => Promise.resolve(mocks.host).then(resolve),
			};
			return query;
		});
		mocks.patch.mockResolvedValue();
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
});
