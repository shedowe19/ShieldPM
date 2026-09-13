import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ directory: "", host: null, clone: vi.fn(), log: vi.fn() }));
vi.mock("node:path", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		default: {
			...actual,
			join: (first, ...rest) => actual.join(first === "/data/websites" ? state.directory : first, ...rest),
		},
	};
});
vi.mock("isomorphic-git", () => ({
	default: {
		currentBranch: async () => "main",
		getConfig: async () => "https://old.example/site.git",
		clone: state.clone,
		log: state.log,
	},
}));
vi.mock("isomorphic-git/http/node", () => ({ default: {} }));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: (value) => value, decrypt: (value) => value }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => {
			const query = {
				findById: () => query,
				where: () => query,
				patch: async (data) => Object.assign(state.host, data),
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) => Promise.resolve({ ...state.host }).then(resolve, reject),
			};
			return query;
		},
	},
}));

import gitDeploy from "../../internal/git-deploy.js";

describe("Git Deploy keeps the published site during repository replacement", () => {
	beforeEach(() => {
		state.directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-sixth-git-deploy-"));
		const published = path.join(state.directory, "host-7");
		fs.mkdirSync(path.join(published, ".git"), { recursive: true });
		fs.writeFileSync(path.join(published, "index.html"), "published site");
		state.host = {
			id: 7,
			forward_scheme: "path",
			forward_host: published,
			git_repo_url: "https://new.example/site.git",
			git_branch: "main",
		};
		state.clone.mockReset();
		state.log.mockReset().mockResolvedValue([{ oid: "new-revision" }]);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(state.directory, { recursive: true, force: true });
	});

	it("preserves the old checkout when a replacement clone fails after writing partial files", async () => {
		state.clone.mockImplementation(async ({ dir }) => {
			fs.writeFileSync(path.join(dir, "partial.html"), "incomplete replacement");
			throw new Error("Repository authentication failed");
		});
		expect(await gitDeploy.sync(null, 7)).toMatchObject({ success: false });
		expect(fs.existsSync(path.join(state.host.forward_host, "index.html"))).toBe(true);
		expect(fs.readFileSync(path.join(state.host.forward_host, "index.html"), "utf8")).toBe("published site");
		expect(fs.readdirSync(state.directory)).toEqual(["host-7"]);
	});
	it("publishes the replacement only after the clone has completed and the host remains current", async () => {
		fs.chmodSync(state.host.forward_host, 0o755);
		state.clone.mockImplementation(async ({ dir }) => {
			expect(fs.readFileSync(path.join(state.host.forward_host, "index.html"), "utf8")).toBe("published site");
			fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
			fs.writeFileSync(path.join(dir, "index.html"), "replacement site");
		});
		expect(await gitDeploy.sync(null, 7)).toMatchObject({ success: true });
		expect(fs.readFileSync(path.join(state.host.forward_host, "index.html"), "utf8")).toBe("replacement site");
		expect(fs.statSync(state.host.forward_host).mode & 0o777).toBe(0o755);
		expect(fs.readdirSync(state.directory)).toEqual(["host-7"]);
	});

	it("restores the published directory if publishing the completed replacement fails", async () => {
		state.clone.mockImplementation(async ({ dir }) =>
			fs.writeFileSync(path.join(dir, "index.html"), "replacement site"),
		);
		const rename = fs.renameSync;
		vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
			if (source.includes(".clone-") && !source.endsWith(".previous")) throw new Error("Publication failed");
			return rename(source, destination);
		});
		expect(await gitDeploy.sync(null, 7)).toMatchObject({ success: false, message: "Publication failed" });
		expect(fs.readFileSync(path.join(state.host.forward_host, "index.html"), "utf8")).toBe("published site");
		expect(fs.readdirSync(state.directory)).toEqual(["host-7"]);
	});
	it("discards a replacement whose repository changes while cloning", async () => {
		state.clone.mockImplementation(async ({ dir }) => {
			fs.writeFileSync(path.join(dir, "index.html"), "stale replacement");
			state.host = { ...state.host, git_repo_url: "https://third.example/site.git" };
		});
		expect(await gitDeploy.sync(null, 7)).toMatchObject({ success: false });
		expect(fs.readFileSync(path.join(state.host.forward_host, "index.html"), "utf8")).toBe("published site");
		expect(fs.readdirSync(state.directory)).toEqual(["host-7"]);
	});
	it.each([
		["repository", { git_repo_url: "https://third.example/site.git" }],
		["forwarding scheme", { forward_scheme: "http", forward_host: "upstream.example" }],
	])("discards a replacement when %s changes during commit lookup", async (_field, changed) => {
		const published = state.host.forward_host;
		const logStarted = Promise.withResolvers();
		const logResult = Promise.withResolvers();
		state.clone.mockImplementation(async ({ dir }) =>
			fs.writeFileSync(path.join(dir, "index.html"), "stale replacement"),
		);
		state.log.mockImplementation(() => {
			logStarted.resolve();
			return logResult.promise;
		});
		const syncing = gitDeploy.sync(null, 7);
		await logStarted.promise;
		state.host = { ...state.host, ...changed };
		logResult.resolve([{ oid: "stale-revision" }]);
		expect(await syncing).toMatchObject({ success: false, message: expect.stringContaining("changed") });
		expect(fs.readFileSync(path.join(published, "index.html"), "utf8")).toBe("published site");
		expect(state.host).toMatchObject(changed);
		expect(state.host.git_last_commit).toBeUndefined();
		expect(state.host.git_last_sync).toBeUndefined();
		expect(fs.readdirSync(state.directory)).toEqual(["host-7"]);
	});
});
