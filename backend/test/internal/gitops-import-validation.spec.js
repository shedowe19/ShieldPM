import * as yaml from "js-yaml";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const files = new Map();
	const writes = [];
	const prunes = [];
	const rows = {};
	const pruneError = { value: null };
	const recordWrite = (name, data) => {
		writes.push({ name, data });
		if (name === "FirewallList" || name === "ProxyHost") {
			const existing = (rows[name] || []).find((entry) => entry.id === data.id);
			if (existing) Object.assign(existing, data);
			else {
				rows[name] ??= [];
				rows[name].push({ ...data });
			}
		}
		return data;
	};
	const makeModel = (name) => ({
		name,
		query: () => {
			const filters = [];
			const query = {
				select: () => query,
				where: (field, value) => {
					if (name === "FirewallList" || name === "ProxyHost")
						filters.push(
							(row) =>
								row[field] === value ||
								Number(row[field] ?? (field === "is_deleted" ? 0 : undefined)) === value,
						);
					return query;
				},
				whereIn: (field, values) => {
					if (name === "FirewallList") filters.push((row) => values.includes(row[field]));
					return query;
				},
				whereNot: () => query,
				findOne: (filter) =>
					Promise.resolve(
						(rows[name] || []).find((entry) =>
							Object.entries(filter).every(([field, value]) => entry[field] === value),
						),
					),
				withGraphFetched: () => query,
				whereNotIn: (field, ids) => {
					prunes.push({ name, ids });
					if (pruneError.value) return Promise.reject(pruneError.value);
					if (name === "FirewallList" || name === "ProxyHost") {
						return Promise.resolve((rows[name] || []).filter((row) => !ids.includes(row[field])));
					}
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
					return recordWrite(name, data);
				},
				insertGraph: async (data) => {
					return recordWrite(name, data);
				},
				upsertGraph: async (data) => {
					return recordWrite(name, data);
				},
				patchAndFetchById: async (id, data) => {
					const existing = (rows[name] || []).find((entry) => entry.id === id);
					if (existing) Object.assign(existing, data);
					writes.push({ name, data });
					return existing || data;
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection query builders are intentionally thenable.
				then: (resolve, reject) =>
					Promise.resolve((rows[name] || []).filter((row) => filters.every((filter) => filter(row)))).then(
						resolve,
						reject,
					),
			};
			return query;
		},
	});
	return { files, writes, prunes, rows, makeModel, pruneError, geoip: vi.fn(), asn: vi.fn(), status: vi.fn() };
});
vi.mock("../../lib/firewall-geoip.js", () => ({
	assertCountryFirewallAvailable: mocks.geoip,
	assertAsnFirewallAvailable: mocks.asn,
	getFirewallGeoipStatus: mocks.status,
}));
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
vi.mock("../../models/firewall_list.js", () => ({ default: mocks.makeModel("FirewallList") }));
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
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => false, isPostgres: () => false }));
vi.mock("../../lib/encryption.js", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));
vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	access: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	nginx: { error: vi.fn() },
	debug: vi.fn(),
}));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/firewall-list.js", () => ({
	default: {
		get: vi.fn(async (_access, { id }) => {
			const row = (mocks.rows.FirewallList || []).find((entry) => entry.id === id && !entry.is_deleted);
			if (!row || row.hidden) throw new Error(`Firewall list ${id} not visible`);
			return row;
		}),
		assertExistForHost: vi.fn(async (ids) => {
			for (const id of ids) {
				if (!(mocks.rows.FirewallList || []).some((entry) => entry.id === id && !entry.is_deleted)) {
					throw new Error(`Firewall list ${id} no longer exists`);
				}
			}
		}),
	},
}));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		withConfigurationLock: vi.fn((callback) => callback()),
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

import firewallLists from "../../internal/firewall-list.js";
import gitops from "../../internal/gitops.js";
import nginx from "../../internal/nginx.js";
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
		mocks.geoip.mockResolvedValue(undefined);
		mocks.asn.mockResolvedValue(undefined);
		mocks.status.mockResolvedValue({ available: true, asn: { available: true } });
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
		mocks.rows.FirewallList = [{ id: 91, name: "Local firewall", entries: "203.0.113.10", is_deleted: 0 }];
		await gitops.importConfig(access, { overwrite: true });
		expect(mocks.prunes).toEqual([]);
		expect(mocks.rows.FirewallList).toEqual([
			{ id: 91, name: "Local firewall", entries: "203.0.113.10", is_deleted: 0 },
		]);
		expect(mocks.writes).toEqual([]);
	});
	it("restores normalized subscription cache before hosts without downloading the source", async () => {
		file("firewall-lists", {
			id: 7,
			name: "VPN networks",
			reason: "Website access rule",
			description: "Private note",
			source_type: "url",
			source_url: "https://example.test/vpn.txt",
			update_interval_hours: 24,
			enabled: true,
			entries: "203.0.113.129/24\n203.0.113.0/24\n2001:0db8:0000::/32\n# cached",
			entry_count: 999,
			unknown: "remove",
		});
		file("proxy-hosts", {
			id: 9,
			domain_names: ["example.test"],
			meta: { ip_firewall: { enabled: true, list_ids: [7] } },
		});
		const fetchSource = vi.spyOn(globalThis, "fetch");
		try {
			const result = await gitops.importConfig(access, { overwrite: true });
			expect(result.success).toBe(true);
			expect(mocks.writes.find(({ name }) => name === "FirewallList").data).toMatchObject({
				id: 7,
				entries: "203.0.113.0/24\n2001:db8::/32",
				entry_count: 2,
				source_type: "url",
				source_url: "https://example.test/vpn.txt",
				description: "Private note",
				is_deleted: 0,
			});
			expect(mocks.writes.find(({ name }) => name === "FirewallList").data).not.toHaveProperty("unknown");
			expect(mocks.writes.find(({ name }) => name === "ProxyHost").data.meta.ip_firewall).toMatchObject({
				enabled: true,
				list_ids: [7],
				allowlist: [],
				denylist: [],
			});
			expect(mocks.writes.map(({ name }) => name)).toEqual(["FirewallList", "ProxyHost"]);
			expect(fetchSource).not.toHaveBeenCalled();
		} finally {
			fetchSource.mockRestore();
		}
	});
	it("rejects invalid cached firewall addresses without writing or pruning firewall lists", async () => {
		mocks.rows.FirewallList = [{ id: 7, name: "Working list", entries: "203.0.113.10", is_deleted: 0 }];
		file("firewall-lists", {
			id: 7,
			name: "Broken replacement",
			reason: "Website access rule",
			source_type: "url",
			source_url: "https://example.test/vpn.txt",
			enabled: true,
			entries: "203.0.113.10\n198.51.100.1/999",
		});
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors).toContainEqual(
			expect.stringMatching(/firewall-lists\/1.yaml:.*Invalid firewall list entries/),
		);
		expect(mocks.writes).toEqual([]);
		expect(mocks.prunes).toEqual([]);
		expect(mocks.rows.FirewallList[0].entries).toBe("203.0.113.10");
	});
	it.each([
		{ enabled: true, entries: "" },
		{ enabled: true, entries: "\uFEFF# cached list\r\n \t\r\n# no networks\r\n" },
		{ enabled: true, entries: undefined },
		{ enabled: false, entries: "" },
		{ enabled: false, entries: "# no networks\n\n" },
		{ enabled: false, entries: undefined },
	])("rejects empty URL caches before writes or pruning: %j", async ({ enabled, entries }) => {
		const working = {
			id: 7,
			name: "Working subscription",
			source_type: "url",
			source_url: "https://example.test/vpn.txt",
			entries: "203.0.113.10",
			enabled: true,
			is_deleted: 0,
		};
		mocks.rows.FirewallList = [{ ...working }];
		file("firewall-lists", {
			id: 7,
			name: "Empty replacement",
			reason: "Website access rule",
			source_type: "url",
			source_url: "https://example.test/vpn.txt",
			entry_count: 999,
			enabled,
			entries,
		});

		const result = await gitops.importConfig(access, { overwrite: true });

		expect(result.success).toBe(false);
		expect(result.errors).toContainEqual(
			expect.stringMatching(/firewall-lists\/1.yaml:.*Cached URL firewall list is empty/),
		);
		expect(mocks.writes).toEqual([]);
		expect(mocks.prunes).toEqual([]);
		expect(mocks.rows.FirewallList).toEqual([working]);
	});
	it("restores a host from list A to list B and removes stale A in one full sync", async () => {
		mocks.rows.FirewallList = [{ id: 1, name: "A", entries: "203.0.113.10", enabled: true, is_deleted: 0 }];
		mocks.rows.ProxyHost = [{ id: 9, is_deleted: 0, meta: { ip_firewall: { enabled: true, list_ids: [1] } } }];
		file("firewall-lists", { id: 2, name: "B", reason: "Replacement list", entries: "198.51.100.0/24" });
		file("proxy-hosts", { id: 9, meta: { ip_firewall: { enabled: true, list_ids: [2] } } });

		const result = await gitops.importConfig(access, { overwrite: true });

		expect(result.success).toBe(true);
		expect(result.deleted).toBe(1);
		expect(mocks.rows.ProxyHost[0].meta.ip_firewall.list_ids).toEqual([2]);
		expect(mocks.rows.FirewallList.find((row) => row.id === 1).is_deleted).toBe(1);
		expect(mocks.rows.FirewallList.find((row) => row.id === 2).is_deleted).toBe(0);
		expect(mocks.writes.map(({ name }) => name)).toEqual(["FirewallList", "ProxyHost", "FirewallList"]);
	});
	it("retains list A when the host restore fails after importing replacement B", async () => {
		mocks.rows.FirewallList = [{ id: 1, name: "A", entries: "203.0.113.10", enabled: true, is_deleted: 0 }];
		mocks.rows.ProxyHost = [{ id: 9, is_deleted: 0, meta: { ip_firewall: { enabled: true, list_ids: [1] } } }];
		file("firewall-lists", { id: 2, name: "B", reason: "Replacement list", entries: "198.51.100.0/24" });
		file("proxy-hosts", { id: 9, meta: { ip_firewall: { enabled: true, list_ids: ["2"] } } });

		const result = await gitops.importConfig(access, { overwrite: true });

		expect(result.success).toBe(false);
		expect(result.errors).toContainEqual(expect.stringMatching(/Firewall list IDs must be positive integers/));
		expect(mocks.rows.ProxyHost[0].meta.ip_firewall.list_ids).toEqual([1]);
		expect(mocks.rows.FirewallList.find((row) => row.id === 1).is_deleted).toBe(0);
		expect(mocks.prunes.some(({ name }) => name === "FirewallList")).toBe(false);
	});
	it("prunes stale firewall lists after the same full sync removes their host", async () => {
		mocks.rows.FirewallList = [{ id: 1, name: "A", entries: "203.0.113.10", enabled: true, is_deleted: 0 }];
		mocks.rows.ProxyHost = [
			{ id: 9, is_deleted: 0, meta: JSON.stringify({ ip_firewall: { enabled: false, list_ids: [1] } }) },
		];
		mocks.files.set("/data/gitops/shieldpm-config/firewall-lists/.gitkeep", "");
		mocks.files.set("/data/gitops/shieldpm-config/proxy-hosts/.gitkeep", "");

		const result = await gitops.importConfig(access, { overwrite: true });

		expect(result.success).toBe(true);
		expect(result.deleted).toBe(2);
		expect(mocks.rows.ProxyHost[0].is_deleted).toBe(1);
		expect(mocks.rows.FirewallList[0].is_deleted).toBe(1);
	});
	it("retains stale firewall lists if activation of the restored host fails", async () => {
		mocks.rows.FirewallList = [{ id: 1, name: "A", entries: "203.0.113.10", enabled: true, is_deleted: 0 }];
		mocks.rows.ProxyHost = [{ id: 9, is_deleted: 0, meta: { ip_firewall: { enabled: true, list_ids: [1] } } }];
		file("firewall-lists", { id: 2, name: "B", reason: "Replacement list", entries: "198.51.100.0/24" });
		file("proxy-hosts", { id: 9, meta: { ip_firewall: { enabled: true, list_ids: [2] } } });
		vi.mocked(nginx.reload).mockRejectedValueOnce(new Error("Nginx reload failed"));

		const result = await gitops.importConfig(access, { overwrite: true });

		expect(result.success).toBe(false);
		expect(result.errors).toContain("Nginx reload failed");
		expect(mocks.rows.FirewallList.find((row) => row.id === 1).is_deleted).toBe(0);
		expect(mocks.prunes.some(({ name }) => name === "FirewallList")).toBe(false);
	});
	it("retains the active firewall list when the real Nginx batch rolls back failed validation", async () => {
		mocks.rows.FirewallList = [{ id: 1, name: "A", entries: "203.0.113.10", enabled: true, is_deleted: 0 }];
		mocks.rows.ProxyHost = [{ id: 9, is_deleted: 0, meta: { ip_firewall: { enabled: true, list_ids: [1] } } }];
		file("firewall-lists", { id: 2, name: "B", reason: "Replacement list", entries: "198.51.100.0/24" });
		file("proxy-hosts", { id: 9, meta: { ip_firewall: { enabled: true, list_ids: [2] } } });
		const { default: realNginx } = await vi.importActual("../../internal/nginx.js");
		const failure = new Error("Restored Nginx configuration is invalid");
		const staged = [];
		const configure = vi.spyOn(realNginx, "configureHost").mockImplementation(async (model, host_type, host) => {
			const stage = { model, host_type, host };
			staged.push(stage);
			return stage;
		});
		const test = vi.spyOn(realNginx, "test").mockRejectedValueOnce(failure);
		const rollback = vi.spyOn(realNginx, "rollbackStagedConfig").mockResolvedValue({ nginx_online: false });
		const commit = vi.spyOn(realNginx, "commitStagedConfig");
		vi.mocked(nginx.bulkGenerateConfigGroups).mockImplementationOnce(realNginx.bulkGenerateConfigGroups);
		try {
			const result = await gitops.importConfig(access, { overwrite: true });

			expect(result.success).toBe(false);
			expect(result.errors).toContain(failure.message);
			expect(nginx.bulkGenerateConfigGroups).toHaveBeenCalledWith(expect.any(Array), { throwOnError: true });
			expect(test).toHaveBeenCalledOnce();
			expect(rollback).toHaveBeenCalledExactlyOnceWith(staged[0], failure);
			expect(commit).not.toHaveBeenCalled();
			expect(nginx.reload).not.toHaveBeenCalled();
			expect(mocks.rows.FirewallList.find((row) => row.id === 1).is_deleted).toBe(0);
			expect(mocks.prunes.some(({ name }) => name === "FirewallList")).toBe(false);
		} finally {
			configure.mockRestore();
			test.mockRestore();
			rollback.mockRestore();
			commit.mockRestore();
		}
	});
	it.each([true, false])(
		"prevents a new host write with a dangling firewall reference even when enabled=%s",
		async (enabled) => {
			file("proxy-hosts", {
				id: 9,
				domain_names: ["example.test"],
				meta: { ip_firewall: { enabled, list_ids: [7] } },
			});
			const result = await gitops.importConfig(access, { overwrite: true });
			expect(result.success).toBe(false);
			expect(result.errors).toContainEqual(expect.stringMatching(/Firewall list 7 not visible/));
			expect(firewallLists.get).toHaveBeenCalledWith(access, { id: 7 });
			expect(mocks.writes).toEqual([]);
			expect(mocks.prunes).toEqual([]);
		},
	);
	it.each(["object", "JSON string"])(
		"checks retained firewall references from %s metadata before an overwrite",
		async (storage) => {
			const meta = { ip_firewall: { enabled: false, list_ids: [7] } };
			mocks.rows.ProxyHost = [{ id: 9, meta: storage === "object" ? meta : JSON.stringify(meta) }];
			mocks.rows.FirewallList = [
				{ id: 7, name: "Deleted list", entries: "203.0.113.10", enabled: false, is_deleted: 1 },
			];
			file("proxy-hosts", { id: 9, domain_names: ["example.test"], forward_host: "new.test" });
			const result = await gitops.importConfig(access, { overwrite: true });
			expect(result.success).toBe(false);
			expect(result.errors).toContainEqual(expect.stringMatching(/Firewall list 7 no longer exists/));
			expect(firewallLists.assertExistForHost).toHaveBeenCalledWith([7]);
			expect(mocks.writes).toEqual([]);
			expect(mocks.prunes).toEqual([]);
		},
	);
	it("rejects malformed host firewall settings before any host write or prune", async () => {
		file("proxy-hosts", { id: 9, meta: { ip_firewall: { enabled: true, list_ids: ["7"] } } });
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors).toContainEqual(expect.stringMatching(/Firewall list IDs must be positive integers/));
		expect(mocks.writes).toEqual([]);
		expect(mocks.prunes).toEqual([]);
	});
	it("preserves normalized country filters when restoring a proxy host from GitOps", async () => {
		file("proxy-hosts", {
			id: 9,
			meta: {
				ip_firewall: {
					enabled: true,
					country_denylist: ["de", "XK", "DE"],
					country_reason: "Regional access rule",
					block_unknown_country: true,
				},
			},
		});
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(mocks.writes.find(({ name }) => name === "ProxyHost").data.meta.ip_firewall).toMatchObject({
			country_denylist: ["DE", "XK"],
			country_reason: "Regional access rule",
			block_unknown_country: true,
		});
	});
	it("rejects invalid restored country codes before writes or host pruning", async () => {
		file("proxy-hosts", { id: 9, meta: { ip_firewall: { country_denylist: ["ZZ"] } } });
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors).toContainEqual(expect.stringMatching(/valid ISO alpha-2 codes or XK/));
		expect(mocks.writes).toEqual([]);
		expect(mocks.prunes).toEqual([]);
	});
	it("rejects active country restoration before host writes or pruning without GeoIP support", async () => {
		mocks.geoip.mockRejectedValueOnce(new Error("Country firewall requires supported GeoIP configuration"));
		file("proxy-hosts", { id: 9, meta: { ip_firewall: { enabled: true, country_denylist: ["DE"] } } });
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors).toContainEqual(expect.stringMatching(/supported GeoIP/));
		expect(mocks.writes).toEqual([]);
		expect(mocks.prunes).toEqual([]);
	});
	it("restores disabled country rules while active GeoIP filtering is unavailable", async () => {
		mocks.geoip.mockImplementationOnce(async (policy) => {
			if (policy.enabled) throw new Error("Country firewall requires supported GeoIP configuration");
		});
		file("proxy-hosts", {
			id: 9,
			meta: { ip_firewall: { enabled: false, country_denylist: ["DE"], block_unknown_country: true } },
		});
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(mocks.writes.find(({ name }) => name === "ProxyHost").data.meta.ip_firewall).toMatchObject({
			enabled: false,
			country_denylist: ["DE"],
			block_unknown_country: true,
		});
	});
	it("roundtrips ASN rules and public reasons through GitOps export YAML and restore", async () => {
		const exported = gitops.sanitizeForExport(
			{
				id: 9,
				is_deleted: 0,
				meta: {
					ip_firewall: {
						enabled: true,
						country_denylist: ["de"],
						asn_denylist: [{ asn: 13335, reason: " Network policy " }, { asn: 4294967295 }],
					},
				},
			},
			["is_deleted"],
		);
		mocks.files.set("/data/gitops/shieldpm-config/proxy-hosts/1.yaml", yaml.dump(exported, { indent: 2 }));
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(mocks.writes.find(({ name }) => name === "ProxyHost").data.meta.ip_firewall).toMatchObject({
			country_denylist: ["DE"],
			asn_denylist: [
				{ asn: 13335, reason: "Network policy" },
				{ asn: 4294967295, reason: "" },
			],
		});
		expect(mocks.status).toHaveBeenCalledOnce();
	});
	it.each([
		[{ asn: 0 }],
		[{ asn: 4294967296 }],
		[{ asn: "13335" }],
		[{ asn: 13335 }, { asn: 13335, reason: "Another rule" }],
	])("rejects malformed restored ASN rules before writes or host pruning: %j", async (asnRules) => {
		file("proxy-hosts", { id: 9, meta: { ip_firewall: { asn_denylist: asnRules } } });
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors).toContainEqual(expect.stringMatching(/Firewall ASN|Duplicate firewall ASN/));
		expect(mocks.writes).toEqual([]);
		expect(mocks.prunes).toEqual([]);
	});
	it("rejects active ASN restoration before host writes or pruning without ASN support", async () => {
		mocks.asn.mockRejectedValueOnce(new Error("ASN firewall requires supported GeoIP ASN configuration"));
		file("proxy-hosts", { id: 9, meta: { ip_firewall: { enabled: true, asn_denylist: [{ asn: 13335 }] } } });
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(false);
		expect(result.errors).toContainEqual(expect.stringMatching(/supported GeoIP ASN/));
		expect(mocks.writes).toEqual([]);
		expect(mocks.prunes).toEqual([]);
	});
	it("restores disabled ASN rules while ASN filtering is unavailable", async () => {
		mocks.asn.mockImplementationOnce(async (policy) => {
			if (policy.enabled) throw new Error("ASN firewall requires supported GeoIP ASN configuration");
		});
		file("proxy-hosts", {
			id: 9,
			meta: { ip_firewall: { enabled: false, asn_denylist: [{ asn: 13335, reason: "Retained" }] } },
		});
		const result = await gitops.importConfig(access, { overwrite: true });
		expect(result.success).toBe(true);
		expect(mocks.writes.find(({ name }) => name === "ProxyHost").data.meta.ip_firewall).toMatchObject({
			enabled: false,
			asn_denylist: [{ asn: 13335, reason: "Retained" }],
		});
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
