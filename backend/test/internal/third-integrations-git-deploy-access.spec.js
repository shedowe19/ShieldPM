import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [], clone: vi.fn(), patch: vi.fn(), mkdir: vi.fn() }));
vi.mock("node:fs", () => ({ default: { existsSync: () => false, mkdirSync: state.mkdir } }));
vi.mock("isomorphic-git", () => ({ default: { clone: state.clone, log: async () => [{ oid: "revision" }] } }));
vi.mock("isomorphic-git/http/node", () => ({ default: {} }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: (value) => value, decrypt: (value) => value }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => {
			const filters = [];
			const rows = () => state.rows.filter((row) => filters.every(([key, value]) => row[key] === value));
			const query = {
				where: (key, value) => {
					filters.push([key, value]);
					return query;
				},
				findById: (id) => query.where("id", id),
				patch: async (data) => {
					state.patch(data);
					for (const row of rows()) Object.assign(row, data);
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) => Promise.resolve(rows()[0]).then(resolve, reject),
			};
			return query;
		},
	},
}));

import gitDeploy from "../../internal/git-deploy.js";

const access = (visibility) => ({
	can: vi.fn().mockResolvedValue({ permission_visibility: visibility }),
	token: { getUserId: () => 7 },
});

describe("Git Deploy caller ownership", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.rows = [
			{
				id: 3,
				owner_user_id: 8,
				is_deleted: 0,
				forward_scheme: "path",
				forward_host: "/data/websites/host-3",
				git_repo_url: "https://repo.example/site.git",
				git_branch: "main",
			},
		];
	});
	afterEach(() => {
		gitDeploy.stopAllPolling();
		vi.restoreAllMocks();
	});
	it.each(["sync", "getStatus", "updateConfig"])(
		"rejects %s for a foreign host before side effects",
		async (method) => {
			await expect(
				gitDeploy[method](access("user"), 3, { git_repo_url: "https://other.example/site.git" }),
			).rejects.toMatchObject({ status: 404 });
			expect(state.clone).not.toHaveBeenCalled();
			expect(state.patch).not.toHaveBeenCalled();
			expect(state.mkdir).not.toHaveBeenCalled();
		},
	);
	it("supports owned hosts, global visibility, and scheduled internal synchronization", async () => {
		expect(await gitDeploy.getStatus(access("all"), 3)).toHaveProperty("git_repo_url");
		state.rows[0].owner_user_id = 7;
		expect(await gitDeploy.sync(access("user"), 3)).toMatchObject({ success: true });
		state.rows[0].owner_user_id = 8;
		expect(await gitDeploy.sync(null, 3)).toMatchObject({ success: true });
	});
	it("retains one-minute intervals and enforces the minimum only after unit conversion", async () => {
		const polling = vi.spyOn(gitDeploy, "startPollingForHost").mockImplementation(() => {});
		await gitDeploy.updateConfig(access("all"), 3, {
			git_poll_interval: 1,
			git_poll_unit: "m",
			git_sync_enabled: true,
		});
		expect(state.rows[0].git_poll_interval).toBe(1);
		polling.mockRestore();
		vi.spyOn(gitDeploy, "sync").mockResolvedValue({ success: true });
		const setInterval = vi.spyOn(globalThis, "setInterval").mockReturnValue({});
		gitDeploy.startPollingForHost(state.rows[0]);
		expect(setInterval).toHaveBeenLastCalledWith(expect.any(Function), 60000);
		gitDeploy.startPollingForHost({ ...state.rows[0], git_poll_unit: "s" });
		expect(setInterval).toHaveBeenLastCalledWith(expect.any(Function), 10000);
	});
});
