import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, configure: vi.fn(), audit: vi.fn() }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/git-deploy.js", () => ({ default: { startPollingForHost: vi.fn() } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: { configure: state.configure } }));

import host from "../../internal/host.js";
import proxy from "../../internal/proxy-host.js";
import ProxyHost from "../../models/proxy_host.js";

const access = {
	can: vi.fn().mockResolvedValue({ permission_visibility: "all" }),
	token: { getUserId: () => 7 },
};
const input = () => ({
	domain_names: ["original.example.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
	access_list_id: 0,
	certificate_id: 0,
	meta: {},
});
const snapshot = async () => ({
	hosts: await state.db("proxy_host").orderBy("id"),
	domains: await state.db("host_domain").orderBy("id"),
});

describe("atomic proxy host and normalized domain writes", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			for (const field of ["domain_names", "forward_scheme", "forward_host", "meta", "note", "advanced_config"])
				table.text(field);
			for (const field of ["owner_user_id", "forward_port", "access_list_id", "certificate_id"])
				table.integer(field);
			for (const field of ["ssl_forced", "hsts_enabled", "hsts_subdomains", "is_deleted"])
				table.integer(field).defaultTo(0);
			table.integer("enabled").defaultTo(1);
			for (const field of ["maintenance_start", "maintenance_end", "created_on", "modified_on"])
				table.text(field);
		});
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id").references("proxy_host.id");
			table.text("domain_name");
			table.text("created_on");
			table.text("modified_on");
		});
		for (const name of ["user", "certificate", "access_list"])
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("is_deleted").defaultTo(0);
			});
	});
	beforeEach(async () => {
		vi.clearAllMocks();
		await state.db.raw("DROP TRIGGER IF EXISTS reject_domain");
		await state.db("host_domain").delete();
		await state.db("proxy_host").delete();
		vi.spyOn(host, "isHostnameTaken").mockResolvedValue({ is_taken: false });
		state.configure.mockResolvedValue({ nginx_online: true });
	});
	afterAll(async () => {
		vi.restoreAllMocks();
		await state.db.destroy();
	});
	const rejectDomains = () =>
		state.db.raw(
			"CREATE TRIGGER reject_domain BEFORE INSERT ON host_domain BEGIN SELECT RAISE(ABORT, 'domain storage failed'); END",
		);

	it("leaves no host record when inserting its domain fails", async () => {
		await rejectDomains();
		await expect(proxy.create(access, input())).rejects.toThrow("domain storage failed");
		expect(await snapshot()).toEqual({ hosts: [], domains: [] });
		expect(state.configure).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("restores existing domains and host fields when a replacement domain fails", async () => {
		const saved = await ProxyHost.query().insertGraphAndFetch({
			...input(),
			owner_user_id: 7,
			host_domains: [{ domain_name: "original.example.test" }],
		});
		const before = await snapshot();
		await rejectDomains();
		await expect(
			proxy.update(access, { id: saved.id, domain_names: ["replacement.example.test"], note: "changed" }),
		).rejects.toThrow("domain storage failed");
		expect(await snapshot()).toEqual(before);
		expect(state.configure).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("commits both records before rendering a successful create and update", async () => {
		const created = await proxy.create(access, input());
		const updated = await proxy.update(access, {
			id: created.id,
			domain_names: ["replacement.example.test"],
			note: "changed",
		});
		expect(updated.domain_names).toEqual(["replacement.example.test"]);
		expect((await snapshot()).domains).toEqual([
			expect.objectContaining({ proxy_host_id: created.id, domain_name: "replacement.example.test" }),
		]);
		expect(state.configure).toHaveBeenCalledTimes(2);
		expect(state.configure.mock.calls[1][2].note).toBe("changed");
	});
});
