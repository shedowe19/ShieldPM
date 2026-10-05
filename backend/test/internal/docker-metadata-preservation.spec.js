import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const state = vi.hoisted(() => ({ database: null, createCertificate: vi.fn(), generate: vi.fn(), reload: vi.fn() }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/nginx.js", () => ({
	default: { bulkGenerateConfigs: state.generate, reload: state.reload },
}));
vi.mock("../../internal/certificate.js", () => ({ default: { create: state.createCertificate } }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ default: { resetHost: vi.fn() } }));
vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	migrate: { info: vi.fn(), warn: vi.fn() },
}));

import docker from "../../internal/docker.js";
import ProxyHost from "../../models/proxy_host.js";

const firewall = {
	enabled: true,
	list_ids: [4],
	denylist: [{ address: "203.0.113.10", reason: "Operator IP rule" }],
	asn_denylist: [{ asn: 13335, reason: "Operator ASN rule" }],
	country_denylist: ["DE"],
};
const metadata = { ip_firewall: firewall, monitor_note: "Operator note", nested: { keep: [1, 2] }, nginx_online: true };
const container = (labels = {}) => ({
	Id: "abc123",
	Name: "/new-container-name",
	Labels: { "shieldpm.hostname": "docker.example.com", ...labels },
});
const discover = (labels) => docker.processContainer(container(labels), { isRemote: false });
const createHost = (meta = {}) =>
	ProxyHost.query().insertGraphAndFetch({
		owner_user_id: 1,
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: 80,
		host_domains: [{ domain_name: "docker.example.com" }],
		meta: { auto_discovered: true, docker_container_id: "abc123", description: "Old discovery name", ...meta },
		locations: [],
	});

describe("Docker rediscovery preserves current host metadata", () => {
	beforeAll(async () => {
		const directory = backendSourcePath("migrations");
		for (const filename of (await fs.readdir(directory)).filter((name) => name.endsWith(".js")).sort()) {
			await (await import(path.join(directory, filename))).up(state.database);
		}
	});
	beforeEach(async () => {
		vi.clearAllMocks();
		state.createCertificate.mockReset();
		await state.database("host_domain").delete();
		await state.database("proxy_host").delete();
		await state.database("certificate").delete();
		vi.useFakeTimers();
	});
	afterEach(() => {
		if (docker.reloadTimer) clearTimeout(docker.reloadTimer);
		docker.reloadTimer = null;
		docker.pendingHostIds.clear();
		vi.useRealTimers();
	});
	afterAll(async () => state.database.destroy());

	it("retains IP, ASN, country and other metadata while updating discovery fields and the rendered host", async () => {
		const host = await createHost(metadata);
		await discover({ "shieldpm.port": "8080" });
		const current = await ProxyHost.query().findById(host.id);
		expect(current.meta).toEqual({
			...metadata,
			auto_discovered: true,
			docker_container_id: "abc123",
			description: "Auto-discovered container: new-container-name",
		});
		expect(current.forward_port).toBe(8080);
		await vi.advanceTimersByTimeAsync(2000);
		expect(state.generate).toHaveBeenCalledOnce();
		expect(state.generate.mock.calls[0][2][0].meta).toEqual(current.meta);
		expect(state.reload).toHaveBeenCalledOnce();
	});

	it("reloads metadata inside the write transaction after a delayed certificate request", async () => {
		const host = await createHost({ ...metadata, ip_firewall: { ...firewall, enabled: false } });
		const queries = [];
		const onQuery = (query) => queries.push(query);
		state.database.on("query", onQuery);
		state.createCertificate.mockImplementation(async () => {
			// Discovery already read its host snapshot before starting this external operation.
			await ProxyHost.query()
				.findById(host.id)
				.patch({ meta: { ...metadata, saved_during_discovery: true } });
			const [certificate] = await state.database("certificate").insert({ owner_user_id: 1, provider: "other" });
			return { id: certificate };
		});
		try {
			await discover({ "shieldpm.ssl_provider": "letsencrypt" });
		} finally {
			state.database.off("query", onQuery);
		}
		const current = await ProxyHost.query().findById(host.id);
		expect(current.meta.ip_firewall).toEqual(firewall);
		expect(current.meta.saved_during_discovery).toBe(true);
		const begin = queries.findIndex((query) => query.sql === "BEGIN;");
		const read = queries.findIndex(
			(query, index) => index > begin && query.sql.startsWith("select `proxy_host`.*"),
		);
		const write = queries.findIndex((query, index) => index > read && query.sql.startsWith("update `proxy_host`"));
		const commit = queries.findIndex((query, index) => index > write && query.sql === "COMMIT;");
		expect(begin).toBeGreaterThanOrEqual(0);
		expect(read).toBeGreaterThan(begin);
		expect(write).toBeGreaterThan(read);
		expect(commit).toBeGreaterThan(write);
		expect(queries[read].__knexTxId).toBe(queries[write].__knexTxId);
	});

	it("does not resurrect a host deleted during a certificate request", async () => {
		const host = await createHost(metadata);
		state.createCertificate.mockImplementation(async () => {
			await ProxyHost.query().findById(host.id).patch({ is_deleted: 1 });
			return { id: 0 };
		});
		await discover({ "shieldpm.ssl_provider": "letsencrypt" });
		const current = await ProxyHost.query().findById(host.id);
		expect(current.is_deleted).toBe(true);
		expect(current.meta.ip_firewall).toEqual(firewall);
		expect(docker.pendingHostIds.size).toBe(0);
	});

	it("keeps the creation defaults and discovery metadata for a new container", async () => {
		await discover();
		const [host] = await ProxyHost.query().withGraphFetched("host_domains");
		expect(host.meta).toEqual({
			auto_discovered: true,
			docker_container_id: "abc123",
			description: "Auto-discovered container: new-container-name",
		});
		expect(host.domain_names).toEqual(["docker.example.com"]);
		expect(host).toMatchObject({ enabled: true, ssl_forced: false, caching_enabled: false, access_list_id: 0 });
		expect(host.meta.ip_firewall).toBeUndefined();
	});
});
