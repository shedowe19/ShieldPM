import * as yaml from "js-yaml";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const files = new Map();
	const writes = [];
	const prunes = [];
	const rows = {};
	const pruneError = { value: null };
	const makeModel = (name) => ({
		name,
		query: () => {
			const query = {
				where: () => query,
				whereIn: () => query,
				whereNot: () => query,
				findOne: (filter) =>
					Promise.resolve(
						(rows[name] || []).find((entry) =>
							Object.entries(filter).every(([field, value]) => entry[field] === value),
						),
					),
				withGraphFetched: () => query,
				whereNotIn: (_field, ids) => {
					prunes.push({ name, ids });
					if (pruneError.value) return Promise.reject(pruneError.value);
					return Promise.resolve([]);
				},
				findById: (id) => {
					const row = (rows[name] || []).find((entry) => entry.id === id);
					const result = Promise.resolve(row);
					result.withGraphFetched = () => result;
					result.patch = async (data) => {
						writes.push({ name, data });
						Object.assign(row, data);
						return row;
					};
					return result;
				},
				insert: async (data) => {
					writes.push({ name, data });
					return data;
				},
				insertGraph: async (data) => {
					writes.push({ name, data });
					return data;
				},
				upsertGraph: async (data) => {
					writes.push({ name, data });
					return data;
				},
				patchAndFetchById: async (_id, data) => {
					writes.push({ name, data });
					return data;
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
				then: (resolve, reject) => Promise.resolve(rows[name] || []).then(resolve, reject),
			};
			return query;
		},
	});
	return { files, writes, prunes, rows, makeModel, pruneError };
});
vi.mock("node:fs", () => ({
	default: {
		existsSync: (path) =>
			mocks.files.has(path) || [...mocks.files.keys()].some((key) => key.startsWith(`${path}/`)),
		promises: {
			mkdir: vi.fn(),
			readdir: async (path) =>
				[...mocks.files.keys()]
					.filter((key) => key.startsWith(`${path}/`))
					.map((key) => key.slice(path.length + 1))
					.filter((key) => !key.includes("/")),
			readFile: async (path) => mocks.files.get(path),
		},
	},
}));
vi.mock("../../models/user.js", () => ({ default: mocks.makeModel("User") }));
vi.mock("../../models/certificate.js", () => ({ default: mocks.makeModel("Certificate") }));
vi.mock("../../models/access_list.js", () => ({ default: mocks.makeModel("AccessList") }));
vi.mock("../../models/proxy_host.js", () => ({ default: mocks.makeModel("ProxyHost") }));
vi.mock("../../models/proxy_host_monitor.js", () => ({ default: mocks.makeModel("ProxyHostMonitor") }));
vi.mock("../../models/redirection_host.js", () => ({ default: mocks.makeModel("RedirectionHost") }));
vi.mock("../../models/dead_host.js", () => ({ default: mocks.makeModel("DeadHost") }));
vi.mock("../../models/stream.js", () => ({ default: mocks.makeModel("Stream") }));
vi.mock("../../models/cloudflared_tunnel.js", () => ({ default: mocks.makeModel("CloudflaredTunnel") }));
vi.mock("../../models/ddns_provider.js", () => ({ default: mocks.makeModel("DdnsProvider") }));
vi.mock("../../models/setting.js", () => ({ default: mocks.makeModel("Setting") }));
vi.mock("../../lib/gitops-files.js", () => ({
	assertSafeConfigTree: vi.fn(),
	assertNoSymlinkPath: vi.fn(),
	writeConfigFile: vi.fn(),
}));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		bulkGenerateConfigGroups: vi.fn(),
		bulkGenerateConfigs: vi.fn(),
		reload: vi.fn(),
		deleteConfig: vi.fn(),
	},
}));
vi.mock("../../internal/proxy-host-monitor.js", () => ({
	assertMonitorConfig: vi.fn((data) => data),
	default: { update: vi.fn(), removeHost: vi.fn(), resetHost: vi.fn() },
}));

import gitops from "../../internal/gitops.js";
import monitor from "../../internal/proxy-host-monitor.js";
import { assertNoSymlinkPath, writeConfigFile } from "../../lib/gitops-files.js";

const access = { can: vi.fn().mockResolvedValue(true), token: { getUserId: () => 1 } };
const file = (directory, data) =>
	mocks.files.set(`/data/gitops/shieldpm-config/${directory}/1.yaml`, JSON.stringify(data));

describe("GitOps import sanitization and safe restore", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.files.clear();
		mocks.writes.length = 0;
		mocks.prunes.length = 0;
		mocks.pruneError.value = null;
		for (const key of Object.keys(mocks.rows)) delete mocks.rows[key];
	});
	it("removes unknown top-level and nested fields from the actual database payload", async () => {
		file("users", {
			id: 8,
			name: "Example",
			email: "user@example.com",
			roles: ["user"],
			hacked_field: "remove",
			permissions: { visibility: "user", proxy_hosts: "view", nested_attack: "remove" },
		});
		file("settings", { id: "default-site", value: "congratulations", hacked_field: "remove" });
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(mocks.writes.find(({ name }) => name === "User").data).toEqual({
			id: 8,
			name: "Example",
			email: "user@example.com",
			roles: ["user"],
			permissions: { visibility: "user", proxy_hosts: "view" },
			is_deleted: 0,
		});
		expect(mocks.writes.find(({ name }) => name === "Setting").data).toEqual({
			id: "default-site",
			value: "congratulations",
		});
	});
	it("never deletes existing integration data when older backups omit its directory", async () => {
		await gitops.importConfig(access, { overwrite: true });
		expect(mocks.prunes).toEqual([]);
	});
	it("reports invalid imports and prevents pruning that model", async () => {
		file("proxy-hosts", { id: "invalid", domain_names: ["example.com"] });
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(mocks.prunes).toEqual([]);
		expect(mocks.writes).toEqual([]);
	});
	it.each(["all ", "0.0.0.0/00", "0.0.0.0/000"])(
		"rejects Access List client rules that Nginx would normalize into a public allow: %s",
		(address) => {
			expect(() =>
				gitops.sanitizeImportData("AccessList", {
					clients: [{ address, directive: "allow" }],
					id: 7,
					items: [{ username: "upload" }],
				}),
			).toThrow("client addresses");
		},
	);
	it("restores normalized host domains, SSL and configuration fields", async () => {
		file("proxy-hosts", {
			id: 9,
			domain_names: ["example.com"],
			forward_host: "upstream",
			certificate_id: 4,
			ssl_forced: true,
			zstd_enabled: true,
			advanced_config: "add_header X-Test true;",
			unknown: "remove",
		});
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(mocks.writes[0].data).toMatchObject({
			id: 9,
			host_domains: [{ domain_name: "example.com" }],
			certificate_id: 4,
			ssl_forced: true,
			zstd_enabled: true,
		});
		expect(mocks.writes[0].data).not.toHaveProperty("domain_names");
		expect(mocks.writes[0].data).not.toHaveProperty("unknown");
	});
	it("invalidates previous monitor measurements when GitOps changes a proxy host's upstream", async () => {
		mocks.rows.ProxyHost = [{ id: 1, forward_scheme: "http", forward_host: "old.test", forward_port: 8080 }];
		file("proxy-hosts", { id: 1, forward_host: "new.test" });
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(monitor.resetHost).toHaveBeenCalledExactlyOnceWith(1, { disableUnsupported: true });
	});
	it("keeps monitor history when GitOps only changes unrelated proxy host fields", async () => {
		mocks.rows.ProxyHost = [{ id: 1, forward_scheme: "http", forward_host: "same.test", forward_port: 8080 }];
		file("proxy-hosts", { id: 1, forward_host: "same.test", advanced_config: "add_header X-Test yes;" });
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(monitor.resetHost).not.toHaveBeenCalled();
	});
	it("rejects an enabled-by-default relay import before an unchecked path reaches Nginx", async () => {
		mocks.rows.AccessList = [{ clients: [], id: 7, items: [{ username: "upload" }], meta: {} }];
		file("proxy-hosts", {
			access_list_id: 7,
			forward_host: "upstream.test",
			forward_port: 8080,
			forward_scheme: "http",
			id: 9,
			upload_relay_enabled: true,
			upload_relay_path: "/relay; return 200;",
		});
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(mocks.writes).toEqual([]);
	});
	it("fails closed when an imported Access List would make an existing relay public", async () => {
		mocks.rows.ProxyHost = [
			{
				access_list: {
					clients: [{ address: "all", directive: "allow" }],
					items: [{ username: "upload" }],
					meta: {},
					satisfy_any: true,
				},
				access_list_id: 7,
				forward_host: "upstream.test",
				forward_port: 8080,
				forward_scheme: "http",
				id: 9,
				upload_relay_enabled: true,
				upload_relay_max_file_size: 1024 * 1024 * 1024,
				upload_relay_max_pending_bytes: 2 * 1024 * 1024 * 1024,
			},
		];
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors[0]).toMatch(/Upload relay disabled/);
		expect(mocks.writes).toContainEqual({ name: "ProxyHost", data: { upload_relay_enabled: 0 } });
	});
	it("restores DDNS without inserting a nonexistent is_deleted column", async () => {
		file("ddns-providers", {
			id: 2,
			name: "provider",
			provider: "duckdns",
			domains: ["test"],
			config: {},
			ip_ver: "dual",
			enabled: true,
		});
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(mocks.writes[0].data).not.toHaveProperty("is_deleted");
		expect(mocks.writes[0].data.domains).toEqual(["test"]);
	});
	it("rejects string overwrite flags before any database writes or deletions", async () => {
		file("proxy-hosts", { id: 9 });
		await expect(gitops.importConfig(access, { overwrite: "false" })).rejects.toThrow("boolean");
		expect(mocks.writes).toEqual([]);
		expect(mocks.prunes).toEqual([]);
	});
	it("treats tracked empty-module markers as an explicit full-sync deletion", async () => {
		mocks.files.set("/data/gitops/shieldpm-config/ddns-providers/.gitkeep", "");
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(mocks.prunes).toContainEqual({ name: "DdnsProvider", ids: [] });
	});
	it("reports a failed prune query instead of claiming a successful full sync", async () => {
		mocks.files.set("/data/gitops/shieldpm-config/ddns-providers/.gitkeep", "");
		mocks.pruneError.value = new Error("database unavailable");
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors).toContain("ddns-providers: database unavailable");
	});
	it("preserves imported IDs for new objects so references remain valid", async () => {
		file("certificates", { id: 40, provider: "other", nice_name: "certificate" });
		const result = await gitops.importConfig(access);
		expect(result.success).toBe(true);
		expect(mocks.writes[0].data.id).toBe(40);
	});
	it("restores monitor settings only after checking the tracked file path", async () => {
		file("proxy-hosts", { id: 1, domain_names: ["example.test"] });
		file("proxy-host-monitors", {
			host_id: 1,
			enabled: true,
			type: "http",
			path: "/health",
			interval_seconds: 60,
			timeout_ms: 5000,
			expected_status: 200,
			alert_enabled: false,
			skip_certificate_verification: true,
		});
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(assertNoSymlinkPath).toHaveBeenCalledWith(
			"/data/gitops",
			"/data/gitops/shieldpm-config/proxy-host-monitors/1.yaml",
		);
		expect(monitor.update).toHaveBeenCalledWith(
			access,
			1,
			expect.objectContaining({ enabled: true, path: "/health", skip_certificate_verification: true }),
			{ skipAutoPush: true },
		);
	});
	it("restores a monitor's custom CA and HTTPS server name from GitOps", async () => {
		file("proxy-hosts", { id: 1, domain_names: ["example.test"] });
		file("proxy-host-monitors", {
			host_id: 1,
			enabled: true,
			type: "http",
			path: "/health",
			interval_seconds: 60,
			timeout_ms: 5000,
			expected_status: 200,
			alert_enabled: false,
			upstream_ca: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
			upstream_server_name: "service.internal.example",
			skip_certificate_verification: true,
		});
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(monitor.update).toHaveBeenCalledWith(
			access,
			1,
			expect.objectContaining({
				upstream_ca: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
				upstream_server_name: "service.internal.example",
				skip_certificate_verification: true,
			}),
			{ skipAutoPush: true },
		);
	});
	it("exports optional HTTPS trust settings alongside a proxy host monitor", async () => {
		mocks.rows.ProxyHost = [{ id: 1, domain_names: ["example.test"] }];
		mocks.rows.ProxyHostMonitor = [
			{
				host_id: 1,
				enabled: true,
				type: "http",
				path: "/health",
				interval_seconds: 60,
				timeout_ms: 5000,
				expected_status: 200,
				alert_enabled: false,
				upstream_ca: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
				upstream_server_name: "service.internal.example",
				skip_certificate_verification: true,
			},
		];
		const initialize = vi.spyOn(gitops, "initRepo").mockResolvedValue();
		const certificates = vi.spyOn(gitops, "exportCertificateFiles").mockResolvedValue();
		try {
			expect(await gitops.exportConfig()).toContain("/data/gitops/shieldpm-config/proxy-host-monitors/1.yaml");
			const output = vi
				.mocked(writeConfigFile)
				.mock.calls.find(([, filename]) => filename.endsWith("/proxy-host-monitors/1.yaml"));
			expect(yaml.load(output[2])).toMatchObject({
				upstream_ca: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
				upstream_server_name: "service.internal.example",
				skip_certificate_verification: true,
			});
		} finally {
			initialize.mockRestore();
			certificates.mockRestore();
		}
	});
	it("does not prune monitor settings after a failed proxy host import", async () => {
		file("proxy-hosts", { id: "invalid" });
		mocks.files.set("/data/gitops/shieldpm-config/proxy-host-monitors/.gitkeep", "");
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(mocks.prunes.some(({ name }) => name === "ProxyHostMonitor")).toBe(false);
	});
});
