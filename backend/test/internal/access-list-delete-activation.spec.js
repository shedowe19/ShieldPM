import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const state = vi.hoisted(() => ({
	database: null,
	audit: vi.fn(),
	push: vi.fn(),
	stop: vi.fn(),
	websiteDirectory: "",
}));
vi.mock("node:path", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		default: {
			...actual,
			join: (first, ...rest) => actual.join(first === "/data/websites" ? state.websiteDirectory : first, ...rest),
		},
	};
});
vi.mock("isomorphic-git", () => ({
	default: {
		clone: async ({ dir }) => {
			await fs.promises.mkdir(path.join(dir, ".git"));
		},
		pull: async () => {},
		currentBranch: async () => "main",
		getConfig: async () => "https://git.example/site.git",
		log: async () => [{ oid: "new-commit" }],
	},
}));
vi.mock("isomorphic-git/http/node", () => ({ default: {} }));

vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isDemoMode: () => false,
	isSqlite: () => true,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: state.push } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { stop: state.stop } }));
vi.mock("../../internal/upload-relay.js", () => ({ validateRelayConfigForHost: vi.fn() }));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));

import service from "../../internal/access-list.js";
import gitDeploy from "../../internal/git-deploy.js";
import nginx from "../../internal/nginx.js";
import AccessList from "../../models/access_list.js";
import ProxyHost from "../../models/proxy_host.js";

const access = { can: async () => ({ permission_visibility: "all" }), token: { getUserId: () => 1 } };
let directory;
let host;
let filename;
let passwordFile;
let render;
let reload;

describe("Access List deletion activates before retiring authentication", () => {
	beforeAll(async () => {
		for (const name of (await fs.promises.readdir(backendSourcePath("migrations")))
			.filter((name) => name.endsWith(".js"))
			.sort()) {
			await (await import(backendSourcePath(`migrations/${name}`))).up(state.database);
		}
	}, 30000);
	beforeEach(async () => {
		vi.clearAllMocks();
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-acl-delete-"));
		state.websiteDirectory = path.join(directory, "websites");
		filename = path.join(directory, "host.conf");
		passwordFile = path.join(directory, "auth");
		await state.database("host_domain").delete();
		await state.database("proxy_host").delete();
		await state.database("access_list").delete();
		const list = await AccessList.query().insertAndFetch({
			name: "Protected",
			owner_user_id: 1,
			meta: { auth_type: "oauth2_proxy" },
		});
		host = await ProxyHost.query().insertGraphAndFetch({
			owner_user_id: 1,
			access_list_id: list.id,
			upload_relay_enabled: true,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 80,
			host_domains: [{ domain_name: "protected.example" }],
			enabled: true,
			meta: {},
		});
		await fs.promises.writeFile(filename, `protected ${list.id}`);
		await fs.promises.writeFile(passwordFile, "synthetic:password-hash");
		vi.spyOn(service, "getFilename").mockReturnValue(passwordFile);
		vi.spyOn(nginx, "getConfigName").mockReturnValue(filename);
		render = vi.spyOn(nginx, "renderConfig").mockImplementation(async (_type, row) => `acl ${row.access_list_id}`);
		vi.spyOn(nginx, "generateConfig").mockImplementation(async (type, row) => {
			await fs.promises.writeFile(filename, await nginx.renderConfig(type, row));
			return true;
		});
		reload = vi.spyOn(nginx, "reload").mockResolvedValue();
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.promises.rm(directory, { recursive: true, force: true });
	});
	afterAll(async () => state.database.destroy());

	it.each(["render", "reload", "status"])(
		"restores assignments and keeps auth resources when %s fails",
		async (failurePoint) => {
			const failure = new Error(`${failurePoint} failed`);
			if (failurePoint === "render") render.mockRejectedValueOnce(failure);
			if (failurePoint === "reload") reload.mockRejectedValueOnce(failure);
			if (failurePoint === "status") vi.spyOn(nginx, "commitStagedConfig").mockRejectedValueOnce(failure);
			await expect(service.delete(access, { id: host.access_list_id })).rejects.toBe(failure);
			expect((await AccessList.query().findById(host.access_list_id)).is_deleted).toBe(false);
			expect(await ProxyHost.query().findById(host.id)).toMatchObject({
				access_list_id: host.access_list_id,
				upload_relay_enabled: true,
			});
			expect(await fs.promises.readFile(filename, "utf8")).toBe(`protected ${host.access_list_id}`);
			expect(await fs.promises.readFile(passwordFile, "utf8")).toBe("synthetic:password-hash");
			expect(state.stop).not.toHaveBeenCalled();
			expect(state.audit).not.toHaveBeenCalled();
			expect(state.push).not.toHaveBeenCalled();
		},
	);
	it("keeps DB and auth intact when the detachment transaction fails", async () => {
		await state.database.raw(
			"CREATE TRIGGER reject_acl_detach BEFORE UPDATE OF access_list_id ON proxy_host BEGIN SELECT RAISE(ABORT, 'detach rejected'); END",
		);
		try {
			await expect(service.delete(access, { id: host.access_list_id })).rejects.toThrow("detach rejected");
			expect((await AccessList.query().findById(host.access_list_id)).is_deleted).toBe(false);
			expect((await ProxyHost.query().findById(host.id)).access_list_id).toBe(host.access_list_id);
			expect(fs.existsSync(passwordFile)).toBe(true);
			expect(reload).not.toHaveBeenCalled();
			expect(state.stop).not.toHaveBeenCalled();
		} finally {
			await state.database.raw("DROP TRIGGER reject_acl_detach");
		}
	});
	it("retires password and OAuth2 only after detached configs have reloaded", async () => {
		reload.mockImplementationOnce(async () => {
			expect(await fs.promises.readFile(filename, "utf8")).toBe("acl 0");
			expect(fs.existsSync(passwordFile)).toBe(true);
			expect(state.stop).not.toHaveBeenCalled();
		});
		await expect(service.delete(access, { id: host.access_list_id })).resolves.toBe(true);
		expect((await AccessList.query().findById(host.access_list_id)).is_deleted).toBe(true);
		expect(await ProxyHost.query().findById(host.id)).toMatchObject({
			access_list_id: 0,
			upload_relay_enabled: false,
		});
		expect(fs.existsSync(passwordFile)).toBe(false);
		expect(state.stop).toHaveBeenCalledExactlyOnceWith(host.access_list_id);
		expect(state.audit).toHaveBeenCalledOnce();
	});
	it("waits for a current renderer before changing assignments or retiring auth", async () => {
		const entered = Promise.withResolvers();
		const release = Promise.withResolvers();
		const previous = nginx.withConfigurationLock(async () => {
			entered.resolve();
			await release.promise;
		});
		await entered.promise;
		const deletion = service.delete(access, { id: host.access_list_id });
		await new Promise((resolve) => setImmediate(resolve));
		expect((await ProxyHost.query().findById(host.id)).access_list_id).toBe(host.access_list_id);
		expect(fs.existsSync(passwordFile)).toBe(true);
		release.resolve();
		await previous;
		await deletion;
	});
	it("preserves a newer ACL assignment committed after the deletion snapshot", async () => {
		const replacement = await AccessList.query().insertAndFetch({
			name: "Replacement",
			owner_user_id: 1,
			meta: {},
		});
		const transaction = AccessList.transaction;
		vi.spyOn(AccessList, "transaction").mockImplementationOnce(async (callback) => {
			await ProxyHost.query().findById(host.id).patch({ access_list_id: replacement.id });
			return transaction.call(AccessList, callback);
		});
		await expect(service.delete(access, { id: host.access_list_id })).resolves.toBe(true);
		expect(await ProxyHost.query().findById(host.id)).toMatchObject({
			access_list_id: replacement.id,
			upload_relay_enabled: true,
		});
		expect(await fs.promises.readFile(filename, "utf8")).toBe(`acl ${replacement.id}`);
	});

	it("retries a failed Git web-root activation using the persisted state and real Nginx rollback", async () => {
		await ProxyHost.query().findById(host.id).patch({
			forward_scheme: "path",
			forward_host: "/var/www/previous",
			git_repo_url: "https://git.example/site.git",
			git_branch: "main",
		});
		render.mockImplementation(async (_type, row) => `root ${row.forward_host}`);
		await fs.promises.writeFile(filename, "root /var/www/previous");
		reload.mockRejectedValueOnce(new Error("Root activation rejected"));
		await expect(gitDeploy.sync(null, host.id)).resolves.toMatchObject({
			success: false,
			message: expect.stringContaining("Root activation rejected"),
		});
		const pending = await ProxyHost.query().findById(host.id);
		const expectedRoot = path.join(state.websiteDirectory, `host-${host.id}`);
		expect(pending.forward_host).toBe(expectedRoot);
		expect(pending.git_last_error).toContain("Root activation rejected");
		expect(await fs.promises.readFile(filename, "utf8")).toBe("root /var/www/previous");
		await expect(gitDeploy.sync(null, host.id)).resolves.toMatchObject({
			success: true,
			forward_host: expectedRoot,
			forward_scheme: "path",
		});
		expect(await fs.promises.readFile(filename, "utf8")).toBe(`root ${expectedRoot}`);
		expect((await ProxyHost.query().findById(host.id)).git_last_error).toBeNull();
	});
});
