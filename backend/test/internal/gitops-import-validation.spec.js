import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const files = new Map();
	const writes = [];
	const prunes = [];
	const rows = {};
	const makeModel = (name) => ({
		name,
		query: () => {
			const query = {
				where: () => query,
				withGraphFetched: () => query,
				whereNotIn: (_field, ids) => {
					prunes.push({ name, ids });
					return Promise.resolve([]);
				},
				findById: async (id) => (rows[name] || []).find((row) => row.id === id),
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
	return { files, writes, prunes, rows, makeModel };
});
vi.mock("node:fs", () => ({
	default: {
		existsSync: (path) =>
			mocks.files.has(path) || [...mocks.files.keys()].some((key) => key.startsWith(`${path}/`)),
		promises: {
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
	default: { bulkGenerateConfigs: vi.fn(), reload: vi.fn(), deleteConfig: vi.fn() },
}));

import gitops from "../../internal/gitops.js";

const access = { can: vi.fn().mockResolvedValue(true), token: { getUserId: () => 1 } };
const file = (directory, data) =>
	mocks.files.set(`/data/gitops/shieldpm-config/${directory}/1.yaml`, JSON.stringify(data));

describe("GitOps import sanitization and safe restore", () => {
	beforeEach(() => {
		mocks.files.clear();
		mocks.writes.length = 0;
		mocks.prunes.length = 0;
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
	it("restores normalized host domains, SSL and configuration fields", async () => {
		file("proxy-hosts", {
			id: 9,
			domain_names: ["example.com"],
			forward_host: "upstream",
			certificate_id: 4,
			ssl_forced: true,
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
		});
		expect(mocks.writes[0].data).not.toHaveProperty("domain_names");
		expect(mocks.writes[0].data).not.toHaveProperty("unknown");
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
	it("preserves imported IDs for new objects so references remain valid", async () => {
		file("certificates", { id: 40, provider: "other", nice_name: "certificate" });
		const result = await gitops.importConfig(access);
		expect(result.success).toBe(true);
		expect(mocks.writes[0].data.id).toBe(40);
	});
});
