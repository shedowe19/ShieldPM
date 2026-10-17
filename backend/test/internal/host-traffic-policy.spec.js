import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knexFactory from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ host: null, can: vi.fn(), get: vi.fn(), audit: vi.fn() }));
vi.mock("../../internal/proxy-host.js", () => ({ default: { get: state.get } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test" }));

import service, {
	cacheDirectory,
	cacheNamespaceFor,
	cacheRequestKeyPath,
	observedRequestsFor,
} from "../../internal/host-traffic-policy.js";
import nginx from "../../internal/nginx.js";
import {
	normalizeCachePolicy,
	normalizeUpstreamPool,
	validateHostTrafficPolicy,
} from "../../lib/host-traffic-policy.js";
import { up } from "../../migrations/20261017190100_seed_proxy_waf_ruleset.js";

const host = (patch = {}) => ({
	id: 12,
	enabled: true,
	domain_names: ["example.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
	certificate_id: 0,
	access_list_id: 0,
	meta: {},
	advanced_config: "",
	...patch,
});
const pool = () => ({
	enabled: true,
	targets: [
		{ id: "main", host: "127.0.0.1", port: 8080 },
		{ id: "backup", host: "::1", port: 8081, backup: true },
	],
});
let directory;
beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-traffic-policy-"));
	vi.stubEnv("DATA_PATH", directory);
	state.host = host();
	state.can.mockReset().mockResolvedValue(true);
	state.get.mockReset().mockImplementation(async () => state.host);
	state.audit.mockReset().mockResolvedValue({});
});
afterEach(async () => {
	await service.stop();
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	await fs.rm(directory, { recursive: true, force: true });
});
describe("structured traffic policy", () => {
	it("preserves unrelated metadata and seeds the prior WAF choice once", () => {
		const previous = host({
			caching_enabled: true,
			meta: { unknown: { keep: 42 }, ip_firewall: { enabled: true } },
		});
		const update = { meta: { cache_policy: { enabled: false } } };
		validateHostTrafficPolicy(update, previous);
		expect(update.meta).toMatchObject({
			unknown: { keep: 42 },
			ip_firewall: { enabled: true },
			waf_ruleset: "crs",
		});
		const later = { caching_enabled: false, meta: { note: "new" } };
		validateHostTrafficPolicy(later, { ...previous, meta: update.meta });
		expect(later.meta.waf_ruleset).toBe("crs");
		const fresh = { forward_scheme: "http", meta: { extra: true } };
		validateHostTrafficPolicy(fresh);
		expect(fresh.meta.waf_ruleset).toBe("crs");
	});
	it.each(["localhost;include x;", "user@host", "https://example.test", "127.0.0.1/path", "a\nb"])(
		"rejects upstream directive/URL injection %s",
		(name) => {
			expect(() =>
				normalizeUpstreamPool({ enabled: true, targets: [{ id: "a", host: name, port: 80 }] }, host()),
			).toThrow();
		},
	);
	it("keeps unrelated keys in stored legacy JSON metadata during a partial policy update", () => {
		const update = { meta: { cache_policy: { enabled: false } } };
		validateHostTrafficPolicy(update, host({ meta: JSON.stringify({ retained: { nested: 7 }, tags: ["prod"] }) }));
		expect(update.meta).toMatchObject({ retained: { nested: 7 }, tags: ["prod"] });
	});
	it("renders unsaved pool/cache previews without writing files or requiring a database ID", async () => {
		const source = host({ id: 0, meta: { upstream_pool: pool(), cache_policy: { enabled: true } } });
		const rendered = await nginx.renderConfig("proxy_host", source, { preview: true });
		expect(rendered).toContain("upstream spm_pool_0");
		expect(rendered).toContain("/cache/preview");
		expect(await fs.readdir(directory)).toEqual([]);
	});
	it("requires a primary and rejects duplicate targets or invalid weights", () => {
		expect(() =>
			normalizeUpstreamPool({ enabled: true, targets: [{ id: "a", host: "127.0.0.1", backup: true }] }, host()),
		).toThrow("primary");
		expect(() =>
			normalizeUpstreamPool({ enabled: true, targets: [{ id: "a", host: "127.0.0.1", weight: 0 }] }, host()),
		).toThrow("weight");
		expect(() =>
			normalizeUpstreamPool(
				{
					enabled: true,
					targets: [
						{ id: "a", host: "127.0.0.1" },
						{ id: "b", host: "127.0.0.1" },
					],
				},
				host(),
			),
		).toThrow("distinct");
	});
	it("canonicalizes IPv6, produces weighted backups, and keeps the original host untouched", async () => {
		const source = host({ meta: { upstream_pool: pool() } });
		const result = await nginx.renderConfig("proxy_host", source);
		expect(result).toContain("upstream spm_pool_12");
		expect(result).toContain("server [::1]:8081 weight=1 max_fails=1 fail_timeout=10s backup;");
		expect(result).toContain("http://spm_pool_12$request_uri");
		expect(result).not.toContain("non_idempotent;");
		expect(source.forward_host).toBe("127.0.0.1");
	});
	it("renders legacy caching, per-route TTLs and explicit WAF policy independently", async () => {
		const data = host({
			caching_enabled: true,
			block_exploits: true,
			meta: {
				waf_ruleset: "base",
				cache_policy: {
					enabled: true,
					routes: [
						{ path: "/", ttl_seconds: 30 },
						{ path: "/assets/", ttl_seconds: 120 },
					],
				},
			},
		});
		const rendered = await nginx.renderConfig("proxy_host", data);
		expect(rendered).toContain("proxy_cache_path");
		expect(rendered).toContain("proxy_cache_valid 200 30s");
		expect(rendered).toContain("proxy_cache_valid 200 120s");
		expect(rendered).toContain("$http_authorization $http_cookie $http_upgrade");
		expect(rendered).toContain("$upstream_http_set_cookie");
		expect(rendered).toContain("include/modsecurity.conf;");
		expect(rendered).not.toContain("include/modsecurity-crs.conf;");
		expect(normalizeCachePolicy(undefined, host({ caching_enabled: true }))).toMatchObject({
			enabled: true,
			assets_only: true,
		});
	});
	it("always bypasses shared cache for enabled Wasm policies and separates origin revisions", async () => {
		const base = host({ meta: { cache_policy: { enabled: true } } });
		const changed = { ...base, forward_port: 8081 };
		expect(cacheNamespaceFor(changed)).not.toBe(cacheNamespaceFor(base));
		const filtered = host({
			meta: {
				cache_policy: { enabled: true },
				wasm_filters: [{ id: "key", kind: "api_key", enabled: true, config: { header: "x-api-key" } }],
			},
		});
		const rendered = await nginx.renderConfig("proxy_host", filtered);
		expect(rendered).toContain("$http_cookie $http_upgrade 1;");
		const inactive = {
			...filtered,
			meta: { ...filtered.meta, wasm_filters: [{ ...filtered.meta.wasm_filters[0], enabled: false }] },
		};
		expect(await nginx.renderConfig("proxy_host", inactive)).not.toContain("$http_cookie $http_upgrade 1;");
	});
	it("retains legacy non-HTTP hosts while rejecting newly enabled unsupported caches", async () => {
		const legacy = host({
			forward_scheme: "path",
			forward_host: "/data/sites",
			caching_enabled: true,
			block_exploits: true,
		});
		expect(normalizeCachePolicy(undefined, legacy)).toMatchObject({ enabled: false });
		const rendered = await nginx.renderConfig("proxy_host", legacy);
		expect(rendered).not.toContain("proxy_cache_path");
		expect(rendered).toContain("modsecurity-crs.conf");
		expect(() => normalizeCachePolicy({ enabled: true }, legacy)).toThrow("HTTP");
	});
	it("rejects unsafe cache paths and unsupported target protocols", () => {
		expect(() => normalizeCachePolicy({ enabled: true, routes: [{ path: "/;include /secret" }] }, host())).toThrow(
			"prefixes",
		);
		expect(() => normalizeCachePolicy({ enabled: true }, host({ forward_scheme: "path" }))).toThrow("HTTP");
	});
	it("backfills existing WAF choices without altering unrelated metadata or explicit rulesets", async () => {
		const db = knexFactory({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		try {
			await db.schema.createTable("proxy_host", (t) => {
				t.increments("id");
				t.text("meta");
				t.integer("caching_enabled");
				t.string("forward_scheme").defaultTo("http");
			});
			await db("proxy_host").insert([
				{ meta: JSON.stringify({ retain: 7 }), caching_enabled: 0 },
				{ meta: JSON.stringify({ retain: 8 }), caching_enabled: 1 },
				{ meta: JSON.stringify({ waf_ruleset: "base", retain: 9 }), caching_enabled: 1 },
			]);
			await up(db);
			await up(db);
			expect((await db("proxy_host").orderBy("id")).map((row) => JSON.parse(row.meta))).toEqual([
				{ retain: 7, waf_ruleset: "base" },
				{ retain: 8, waf_ruleset: "crs" },
				{ waf_ruleset: "base", retain: 9 },
			]);
		} finally {
			await db.destroy();
		}
	});
});
describe("authorized cache and bounded observations", () => {
	it("purges only the authorized host and a chosen URI, leaves all other cache files", async () => {
		state.host = host({ meta: { cache_policy: { enabled: true } } });
		const dir = cacheDirectory(12);
		await fs.mkdir(dir, { recursive: true });
		const exact = createHash("md5")
			.update(`${cacheNamespaceFor(state.host)}|http|GET|example.test|/app.js`)
			.digest("hex");
		const other = "a".repeat(32);
		await fs.writeFile(path.join(dir, exact), "target");
		await fs.writeFile(path.join(dir, other), "other");
		const alien = cacheDirectory(13);
		await fs.mkdir(alien, { recursive: true });
		await fs.writeFile(path.join(alien, exact), "otherhost");
		const result = await service.purgeCache({ can: state.can }, 12, { path: "/app.js" });
		expect(result.removed).toBe(1);
		expect(await fs.readFile(path.join(dir, other), "utf8")).toBe("other");
		expect(await fs.readFile(path.join(alien, exact), "utf8")).toBe("otherhost");
		expect(state.can).toHaveBeenCalledWith("proxy_hosts:update", 12);
	});
	it("matches Nginx normalized URI keys when query parameters are ignored", () => {
		expect(cacheRequestKeyPath("/a/%C3%A4.css?v=2", { cache_key: "uri_ignore_query" })).toBe("/a/ä.css");
		expect(cacheRequestKeyPath("/a/../b.css?v=2", { cache_key: "uri_ignore_query" })).toBe("/b.css");
		expect(cacheRequestKeyPath("/a%20b.css?v=2", { cache_key: "uri" })).toBe("/a%20b.css?v=2");
	});
	it("cleans retained cache when disabled and removes a deleted host without touching other hosts", async () => {
		state.host = host({ meta: { cache_policy: { enabled: false } } });
		const own = cacheDirectory(12);
		const other = cacheDirectory(13);
		await fs.mkdir(own, { recursive: true });
		await fs.mkdir(other, { recursive: true });
		await fs.writeFile(path.join(own, "a".repeat(32)), "cached");
		await fs.writeFile(path.join(other, "b".repeat(32)), "keep");
		expect((await service.purgeCache({ can: state.can }, 12)).removed).toBe(1);
		await service.removeHostFiles(12);
		await expect(fs.stat(own)).rejects.toMatchObject({ code: "ENOENT" });
		expect(await fs.readFile(path.join(other, "b".repeat(32)), "utf8")).toBe("keep");
	});
	it("removes pool-only logs when the host never had a cache directory", async () => {
		const logs = path.join(directory, "logs");
		await fs.mkdir(logs);
		const own = path.join(logs, "traffic_12.log");
		const other = path.join(logs, "traffic_13.log");
		await fs.writeFile(own, "private");
		await fs.writeFile(`${own}.1`, "rotated");
		await fs.writeFile(other, "keep");
		await service.removeHostFiles(12);
		await expect(fs.stat(own)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(fs.stat(`${own}.1`)).rejects.toMatchObject({ code: "ENOENT" });
		expect(await fs.readFile(other, "utf8")).toBe("keep");
	});
	it("counts exact concrete upstream attempts without matching port prefixes or inventing DNS counts", () => {
		const logs = [
			{ upstream: "127.0.0.1:8080" },
			{ upstream: "127.0.0.1:80, [::1]:8080" },
			{ upstream: "127.0.0.1:8080 : 127.0.0.1:80" },
		];
		expect(observedRequestsFor(logs, { host: "127.0.0.1", port: 80 })).toBe(2);
		expect(observedRequestsFor(logs, { host: "127.0.0.1", port: 8080 })).toBe(2);
		expect(observedRequestsFor(logs, { host: "::1", port: 8080 })).toBe(1);
		expect(observedRequestsFor(logs, { host: "origin.example", port: 8080 })).toBeNull();
	});
	it("denies purge before reading the host or storage", async () => {
		state.can.mockRejectedValue(new Error("denied"));
		await expect(service.purgeCache({ can: state.can }, 12)).rejects.toThrow("denied");
		expect(state.get).not.toHaveBeenCalled();
	});
	it("rejects symlink directories and does not follow files during purge", async () => {
		state.host = host({ meta: { cache_policy: { enabled: true } } });
		const external = path.join(directory, "outside");
		await fs.mkdir(external);
		const file = path.join(external, "b".repeat(32));
		await fs.writeFile(file, "keep");
		const dir = cacheDirectory(12);
		await fs.mkdir(path.dirname(dir), { recursive: true });
		await fs.symlink(external, dir);
		await expect(service.purgeCache({ can: state.can }, 12)).rejects.toThrow("Unsafe");
		expect(await fs.readFile(file, "utf8")).toBe("keep");
	});
	it.each(["../13", "12/../../logs/traffic_13.log", "12%2f..%2f13", "12", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
		"rejects noncanonical host identity %s before storage access",
		async (id) => {
			const logs = path.join(directory, "logs");
			await fs.mkdir(logs);
			const outside = path.join(logs, "traffic_13.log");
			await fs.writeFile(outside, '{"cache":"HIT"}\n');
			expect(() => cacheDirectory(id)).toThrow("Invalid proxy host ID");
			await expect(service.cacheStatus({ can: state.can }, id)).rejects.toThrow("Invalid proxy host ID");
			await expect(service.purgeCache({ can: state.can }, id)).rejects.toThrow("Invalid proxy host ID");
			expect(state.get).not.toHaveBeenCalled();
			expect(await fs.readFile(outside, "utf8")).toBe('{"cache":"HIT"}\n');
		},
	);
	it.each([["nginx"], ["nginx", "cache"]])(
		"refuses purge through a symlinked cache ancestor %j",
		async (...segments) => {
			state.host = host({ meta: { cache_policy: { enabled: true } } });
			const outside = path.join(directory, "outside");
			const actualCache = segments.length === 1 ? path.join(outside, "cache") : outside;
			const externalHost = path.join(actualCache, "host-12");
			await fs.mkdir(externalHost, { recursive: true });
			const marker = path.join(externalHost, "a".repeat(32));
			await fs.writeFile(marker, "keep");
			const link = path.join(directory, ...segments);
			await fs.mkdir(path.dirname(link), { recursive: true });
			await fs.symlink(outside, link);
			await expect(service.purgeCache({ can: state.can }, 12)).rejects.toThrow("Unsafe storage directory");
			await expect(service.removeHostFiles(12)).rejects.toThrow("Unsafe storage directory");
			expect(await fs.readFile(marker, "utf8")).toBe("keep");
		},
	);
	it("purges valid Nginx hash levels without following nested symlinks or unrelated directories", async () => {
		state.host = host({ meta: { cache_policy: { enabled: true } } });
		const own = cacheDirectory(12);
		await fs.mkdir(path.join(own, "b", "cd"), { recursive: true });
		await fs.writeFile(path.join(own, "b", "cd", "a".repeat(32)), "remove");
		await fs.writeFile(path.join(own, "c".repeat(32)), "remove");
		const external = path.join(directory, "outside");
		await fs.mkdir(external);
		const marker = path.join(external, "d".repeat(32));
		await fs.writeFile(marker, "keep");
		await fs.symlink(external, path.join(own, "a"));
		await fs.mkdir(path.join(own, "unrelated"));
		await fs.writeFile(path.join(own, "unrelated", "e".repeat(32)), "unrelated");
		expect((await service.purgeCache({ can: state.can }, 12)).removed).toBe(2);
		expect(await fs.readFile(marker, "utf8")).toBe("keep");
		expect(await fs.readFile(path.join(own, "unrelated", "e".repeat(32)), "utf8")).toBe("unrelated");
	});
	it("rejects symlinked traffic logs and log parents without reading or deleting their targets", async () => {
		const outside = path.join(directory, "outside");
		await fs.mkdir(outside);
		const marker = path.join(outside, "traffic_12.log");
		await fs.writeFile(marker, '{"cache":"HIT"}\n');
		const logs = path.join(directory, "logs");
		await fs.mkdir(logs);
		await fs.symlink(marker, path.join(logs, "traffic_12.log"));
		await expect(service.cacheStatus({ can: state.can }, 12)).rejects.toThrow("Unsafe traffic log");
		await fs.rm(logs, { recursive: true });
		await fs.symlink(outside, logs);
		await expect(service.cacheStatus({ can: state.can }, 12)).rejects.toThrow("Unsafe storage directory");
		await expect(service.removeHostFiles(12)).rejects.toThrow("Unsafe storage directory");
		await expect(service.maintainLogs()).rejects.toThrow("Unsafe storage directory");
		expect(await fs.readFile(marker, "utf8")).toBe('{"cache":"HIT"}\n');
	});
	it("replaces a planted rotation symlink without overwriting its target", async () => {
		const logs = path.join(directory, "logs");
		await fs.mkdir(logs);
		const file = path.join(logs, "traffic_12.log");
		await fs.writeFile(file, Buffer.alloc(10 * 1024 * 1024 + 1, 32));
		const marker = path.join(directory, "outside");
		await fs.writeFile(marker, "keep");
		await fs.symlink(marker, `${file}.1`);
		await service.maintainLogs();
		expect(await fs.readFile(marker, "utf8")).toBe("keep");
		expect((await fs.lstat(`${file}.1`)).isSymbolicLink()).toBe(false);
		expect((await fs.stat(file)).size).toBe(0);
		expect((await fs.stat(`${file}.1`)).size).toBe(10 * 1024 * 1024 + 1);
	});
	it("reports bounded hit/miss samples and rotates oversized observation logs", async () => {
		state.host = host({ meta: { cache_policy: { enabled: true } } });
		const logs = path.join(directory, "logs");
		await fs.mkdir(logs);
		const file = path.join(logs, "traffic_12.log");
		await fs.writeFile(file, '{"cache":"HIT"}\n{"cache":"MISS"}\n{"cache":"BYPASS"}\n');
		expect(await service.cacheStatus({ can: state.can }, 12)).toMatchObject({ hit_ratio: 0.5, sample_requests: 3 });
		await fs.writeFile(file, Buffer.alloc(10 * 1024 * 1024 + 1, 32));
		await service.maintainLogs();
		expect((await fs.stat(file)).size).toBe(0);
		expect((await fs.stat(`${file}.1`)).size).toBe(10 * 1024 * 1024 + 1);
	});
});
