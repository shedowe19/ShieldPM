import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ directory: "", request: vi.fn(), authenticatedUrls: [] }));
vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/encryption.js", () => ({ decrypt: () => "snapshot-token", encrypt: vi.fn() }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../models/setting.js", () => ({
	default: { query: () => ({ where: () => ({ patch: async () => 1 }) }) },
}));
vi.mock("isomorphic-git/http/node", () => ({ default: { request: state.request } }));
vi.mock("isomorphic-git", async (importOriginal) => {
	const { default: actual } = await importOriginal();
	return {
		default: {
			...actual,
			...Object.fromEntries(
				["add", "remove", "statusMatrix", "commit", "currentBranch", "push", "pull"].map((method) => [
					method,
					(options) => actual[method]({ ...options, dir: state.directory }),
				]),
			),
			addRemote: async (options) => {
				await actual.addRemote({ ...options, dir: state.directory });
				// A concurrent sync for a changed repository can replace shared origin here.
				await actual.addRemote({ ...options, dir: state.directory, url: "https://other.example/repo.git" });
			},
		},
	};
});

import gitops from "../../internal/gitops.js";

const { default: git } = await vi.importActual("isomorphic-git");

describe("GitOps credentials stay bound to the configured destination", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		state.authenticatedUrls = [];
		state.directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-gitops-destination-"));
		await git.init({ fs, dir: state.directory, defaultBranch: "main" });
		await fs.promises.writeFile(path.join(state.directory, "config.yaml"), "id: 1\n");
		await git.add({ fs, dir: state.directory, filepath: "." });
		await git.commit({
			fs,
			dir: state.directory,
			message: "initial",
			author: { name: "test", email: "test@example.test" },
		});
		vi.spyOn(gitops, "initRepo").mockResolvedValue();
		vi.spyOn(gitops, "getConfigInternal").mockResolvedValue({
			enabled: true,
			repository_url: "https://configured.example/repo.git",
			branch: "main",
			auth_type: "https",
			encrypted_credentials: "test-ciphertext",
		});
		state.request.mockImplementation(async ({ url, headers }) => {
			if (Object.keys(headers).some((name) => name.toLowerCase() === "authorization")) {
				state.authenticatedUrls.push(url);
				throw new Error("Stop simulated network request after authentication");
			}
			return { url, statusCode: 401, statusMessage: "Unauthorized", headers: {}, body: [] };
		});
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.promises.rm(state.directory, { recursive: true, force: true });
	});

	it.each(["commitAndPush", "pull"])(
		"%s ignores origin changes after taking its credential snapshot",
		async (method) => {
			await gitops[method]();
			expect(state.authenticatedUrls).toHaveLength(1);
			expect(state.authenticatedUrls[0]).toMatch(/^https:\/\/configured\.example\/repo\.git\//);
		},
	);
});
