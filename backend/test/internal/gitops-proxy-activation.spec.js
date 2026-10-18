import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const state = vi.hoisted(() => ({ database: null, directory: "", validation: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	isDemoMode: () => false,
	getEncryptionKey: () => "3".repeat(64),
}));
vi.mock("../../internal/firewall-policy.js", () => ({
	validateHostFirewall: async (...args) => state.validation?.(...args),
	withFirewallReferences: (_data, _existing, write) => write(),
}));
vi.mock("../../internal/proxy-host.js", () => ({ reconcileRestoredHost: vi.fn() }));
vi.mock("../../internal/cloudflared.js", () => ({ default: { stop: vi.fn(), activateImported: vi.fn() } }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ assertMonitorConfig: vi.fn(), default: {} }));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal();
	const map = (value) =>
		typeof value === "string" && value.startsWith("/data/gitops")
			? value.replace("/data/gitops", state.directory)
			: value;
	const promises = new Proxy(actual.default.promises, {
		get: (target, key) =>
			typeof target[key] === "function" ? (...args) => target[key](...args.map(map)) : target[key],
	});
	return {
		...actual,
		default: { ...actual.default, existsSync: (value) => actual.default.existsSync(map(value)), promises },
	};
});
vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal();
	const map = (value) =>
		typeof value === "string" && value.startsWith("/data/gitops")
			? value.replace("/data/gitops", state.directory)
			: value;
	const mapped = Object.fromEntries(
		Object.entries(actual).map(([key, value]) => [
			key,
			typeof value === "function" ? (...args) => value(...args.map(map)) : value,
		]),
	);
	return { ...mapped, default: mapped };
});

import gitops from "../../internal/gitops.js";
import nginx from "../../internal/nginx.js";
import { reconcileRestoredHost } from "../../internal/proxy-host.js";
import { decrypt, encrypt } from "../../lib/encryption.js";
import { withHostDomainClaims } from "../../lib/host-domain-claims.js";
import HostDomain from "../../models/host_domain.js";
import { HostDomainClaimOwner } from "../../models/host_domain_claim.js";
import ProxyHost from "../../models/proxy_host.js";
import Revision from "../../models/proxy_host_revision.js";

const access = { can: async () => ({ permission_visibility: "all" }), token: { getUserId: () => 1 } };
const filters = (value) => [
	{
		id: "auth",
		kind: "api_key",
		enabled: true,
		failure_mode: "closed",
		config: { header: "x-api-key", sealed_value: encrypt(value) },
	},
];
const configFile = (id) => path.join(state.directory, `${id}.conf`);
const importedFile = (id) => path.join(state.directory, "shieldpm-config", "proxy-hosts", `${id}.yaml`);
const writeImport = (data) => fs.writeFile(importedFile(data.id), JSON.stringify(data));
const row = () => ProxyHost.query().findById(1).withGraphFetched("host_domains");
const importAll = () => gitops.importConfig(access, { overwrite: true });
describe("GitOps proxy accepted-state boundary with real SQLite and configuration files", () => {
	beforeAll(async () => {
		const directory = backendSourcePath("migrations");
		for (const filename of (await fs.readdir(directory)).filter((name) => name.endsWith(".js")).sort())
			await (await import(path.join(directory, filename))).up(state.database);
	});
	beforeEach(async () => {
		state.directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-gitops-proxy-"));
		await fs.mkdir(path.dirname(importedFile(1)), { recursive: true });
		for (const table of [
			"proxy_host_revision",
			"host_domain_claim_owner",
			"host_domain_claim",
			"host_domain",
			"proxy_host",
		])
			await state.database(table).delete();
		await withHostDomainClaims({ hostType: "proxy", domainNames: ["old.example"] }, (trx) =>
			ProxyHost.query(trx).insertGraph({
				id: 1,
				owner_user_id: 1,
				forward_host: "127.0.0.1",
				forward_port: 8080,
				forward_scheme: "http",
				enabled: true,
				meta: { nginx_online: true, wasm_filters: filters("old-key") },
				host_domains: [{ domain_name: "old.example" }],
			}),
		);
		await fs.writeFile(configFile(1), "# accepted old configuration\n", { mode: 0o640 });
		state.validation = null;
		vi.spyOn(nginx, "getConfigName").mockImplementation((_type, id) => configFile(id));
		vi.spyOn(nginx, "reload").mockResolvedValue("");
		vi.spyOn(nginx, "deleteConfig").mockImplementation(async (_type, host) =>
			fs.rm(configFile(host.id), { force: true }),
		);
		vi.spyOn(nginx, "bulkGenerateConfigGroupsUnlocked").mockImplementation(async () => []);
		vi.mocked(reconcileRestoredHost).mockClear();
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.rm(state.directory, { recursive: true, force: true });
	});
	afterAll(async () => state.database.destroy());
	it("preserves a secret rotated after the initial read when the imported key is redacted", async () => {
		await writeImport({
			id: 1,
			domain_names: ["old.example"],
			meta: {
				wasm_filters: [
					{
						id: "auth",
						kind: "api_key",
						enabled: true,
						failure_mode: "closed",
						config: { header: "x-api-key", has_secret: true },
					},
				],
			},
		});
		state.validation = async () => {
			state.validation = null;
			await ProxyHost.query()
				.findById(1)
				.patch({ meta: { nginx_online: true, wasm_filters: filters("rotated-key") } });
		};
		expect(await importAll()).toMatchObject({ success: true, imported: 1 });
		expect(decrypt((await row()).meta.wasm_filters[0].config.sealed_value)).toBe("rotated-key");
	});
	it("records a successfully activated import and releases only the previous domain claims", async () => {
		await writeImport({ id: 1, domain_names: ["accepted.example"], forward_port: 9000 });
		vi.mocked(nginx.bulkGenerateConfigGroupsUnlocked).mockImplementationOnce(async () => {
			expect((await HostDomainClaimOwner.query()).map((item) => item.domain_name).sort()).toEqual([
				"accepted.example",
				"old.example",
			]);
			await fs.writeFile(configFile(1), "# accepted imported configuration\n");
		});
		expect(await importAll()).toMatchObject({ success: true, imported: 1 });
		expect((await row()).domain_names).toEqual(["accepted.example"]);
		expect((await HostDomainClaimOwner.query()).map((item) => item.domain_name)).toEqual(["accepted.example"]);
		expect(await Revision.query().where("action", "imported")).toMatchObject([{ actor_user_id: 1 }]);
		expect(reconcileRestoredHost).toHaveBeenCalledOnce();
	});
	it("also compensates status writes for an unchanged proxy omitted from the backup", async () => {
		await fs.rm(path.dirname(importedFile(1)), { recursive: true });
		const previous = JSON.parse(JSON.stringify(await row()));
		vi.mocked(nginx.bulkGenerateConfigGroupsUnlocked).mockImplementationOnce(async () => {
			await ProxyHost.query()
				.findById(1)
				.patch({ meta: { nginx_online: false, nginx_err: "failed candidate" } });
			await fs.writeFile(configFile(1), "# rejected unchanged host\n");
			throw new Error("NGINX rejected full batch");
		});
		expect(await importAll()).toMatchObject({ success: false, imported: 0 });
		expect(JSON.parse(JSON.stringify(await row()))).toEqual(previous);
		expect(await fs.readFile(configFile(1), "utf8")).toBe("# accepted old configuration\n");
	});
	it("compensates DB, domain claims and exact files when the final candidate fails activation", async () => {
		for (const table of ["proxy_host", "host_domain"])
			await state
				.database(table)
				.update({ created_on: "2001-02-03 04:05:06", modified_on: "2002-03-04 05:06:07" });
		const previous = JSON.parse(JSON.stringify(await row()));
		await writeImport({
			id: 1,
			domain_names: ["candidate.example"],
			forward_port: 9000,
			meta: {
				wasm_filters: [
					{
						id: "auth",
						kind: "api_key",
						enabled: true,
						failure_mode: "closed",
						config: { header: "x-api-key", value: "candidate-key" },
					},
				],
			},
		});
		vi.mocked(nginx.bulkGenerateConfigGroupsUnlocked).mockImplementationOnce(async (_groups, options) => {
			expect(options).toEqual({ throwOnError: true, reload: true });
			expect((await row()).domain_names).toEqual(["candidate.example"]);
			expect((await HostDomainClaimOwner.query()).map((item) => item.domain_name).sort()).toEqual([
				"candidate.example",
				"old.example",
			]);
			await fs.writeFile(configFile(1), "# rejected candidate configuration\n");
			throw new Error("Wasm preflight rejected candidate");
		});
		expect(await importAll()).toMatchObject({ success: false, imported: 0 });
		expect(JSON.parse(JSON.stringify(await row()))).toEqual(previous);
		expect((await HostDomainClaimOwner.query()).map((item) => item.domain_name)).toEqual(["old.example"]);
		expect(await fs.readFile(configFile(1), "utf8")).toBe("# accepted old configuration\n");
		expect((await fs.stat(configFile(1))).mode & 0o777).toBe(0o640);
		expect(await Revision.query().where("action", "imported")).toHaveLength(0);
		expect(reconcileRestoredHost).not.toHaveBeenCalled();
		expect(nginx.reload).toHaveBeenCalledOnce();
	});
	it("restores pruned hosts and keeps claims after a rejected full-sync deletion", async () => {
		await fs.writeFile(path.join(path.dirname(importedFile(1)), ".gitkeep"), "");
		vi.mocked(nginx.bulkGenerateConfigGroupsUnlocked).mockRejectedValueOnce(new Error("Reload rejected"));
		expect(await importAll()).toMatchObject({ success: false });
		expect(await row()).toMatchObject({ is_deleted: false, domain_names: ["old.example"] });
		expect(await fs.readFile(configFile(1), "utf8")).toBe("# accepted old configuration\n");
		expect((await HostDomainClaimOwner.query()).map((item) => item.domain_name)).toEqual(["old.example"]);
	});
	it("hides new rejected hosts and releases claims without an accepted revision", async () => {
		await writeImport({ id: 1, meta: { note: "keep first" } });
		await writeImport({
			id: 2,
			owner_user_id: 1,
			domain_names: ["new.example"],
			forward_host: "127.0.0.1",
			forward_port: 8081,
			forward_scheme: "http",
			enabled: true,
		});
		vi.mocked(nginx.bulkGenerateConfigGroupsUnlocked).mockImplementationOnce(async () => {
			await fs.writeFile(configFile(2), "# rejected new listener\n");
			throw new Error("NGINX rejected candidate");
		});
		expect(await importAll()).toMatchObject({ success: false, imported: 0 });
		expect(await ProxyHost.query().findById(2)).toMatchObject({ is_deleted: true });
		expect(await HostDomainClaimOwner.query().where("host_id", 2)).toHaveLength(0);
		expect(await HostDomain.query().where("proxy_host_id", 2)).toHaveLength(1);
		await expect(fs.stat(configFile(2))).rejects.toMatchObject({ code: "ENOENT" });
		expect(await Revision.query().where("host_id", 2)).toHaveLength(0);
	});
});
