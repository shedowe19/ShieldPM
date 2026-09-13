import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	db: null,
	reload: vi.fn(),
	generate: vi.fn(),
	backup: vi.fn(),
	restore: vi.fn(),
	remove: vi.fn(),
	cleanup: vi.fn(),
	policy: vi.fn(),
	oauth: vi.fn(),
	gitops: vi.fn(),
}));
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
vi.mock("../../internal/nginx.js", () => ({
	default: {
		withConfigurationLock: (callback) => callback(),
		backupConfig: state.backup,
		generateConfig: state.generate,
		reload: state.reload,
		restoreConfig: state.restore,
		deleteConfig: state.remove,
		deleteBackupConfig: state.cleanup,
	},
}));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: state.policy } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { start: state.oauth } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: state.gitops } }));

import tor from "../../internal/tor.js";
import ProxyHost from "../../models/proxy_host.js";
import TorOnion from "../../models/tor_onion.js";

const onion = `${"a".repeat(56)}.onion`;
const access = { can: vi.fn(), token: { getUserId: () => 7 } };
const domainRows = () => state.db("host_domain").select("proxy_host_id", "domain_name").orderBy("id");
const currentService = () => TorOnion.query().findById(1);

describe("transactional Tor proxy-host reassignment", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("proxy_host", (t) => {
			t.increments("id");
			t.integer("owner_user_id");
			t.integer("enabled").defaultTo(1);
			t.integer("is_deleted").defaultTo(0);
			t.integer("certificate_id");
			t.integer("access_list_id");
			t.text("meta");
			t.string("modified_on");
		});
		await state.db.schema.createTable("host_domain", (t) => {
			t.increments("id");
			t.integer("proxy_host_id");
			t.string("domain_name");
			t.string("created_on");
			t.string("modified_on");
		});
		for (const table of ["certificate", "access_list"])
			await state.db.schema.createTable(table, (t) => {
				t.increments("id");
				t.integer("is_deleted").defaultTo(0);
				t.text("meta");
			});
		for (const table of ["access_list_auth", "access_list_client"])
			await state.db.schema.createTable(table, (t) => {
				t.increments("id");
				t.integer("access_list_id");
			});
		await state.db.schema.createTable("tor_onion", (t) => {
			t.increments("id");
			t.integer("owner_user_id");
			t.integer("is_deleted").defaultTo(0);
			t.integer("proxy_host_id");
			t.string("name");
			t.string("onion_address");
			t.integer("virtual_port");
			t.integer("target_port");
			t.integer("status");
			t.string("modified_on");
		});
	});
	beforeEach(async () => {
		vi.clearAllMocks();
		state.reload.mockReset().mockResolvedValue();
		state.generate.mockReset().mockResolvedValue();
		state.policy.mockResolvedValue();
		access.can.mockReset().mockResolvedValue({ permission_visibility: "user" });
		await state.db.raw("DROP TRIGGER IF EXISTS reject_tor_update");
		for (const table of ["host_domain", "proxy_host", "tor_onion", "access_list"]) await state.db(table).delete();
		await state.db("proxy_host").insert([
			{ id: 4, owner_user_id: 7, meta: "{}" },
			{ id: 5, owner_user_id: 7, meta: "{}" },
		]);
		await state.db("host_domain").insert([
			{ proxy_host_id: 4, domain_name: "old.example.test" },
			{ proxy_host_id: 4, domain_name: onion },
			{ proxy_host_id: 5, domain_name: "new.example.test" },
		]);
		await state.db("tor_onion").insert({
			id: 1,
			name: "site",
			owner_user_id: 7,
			proxy_host_id: 4,
			onion_address: onion,
			virtual_port: 80,
			target_port: 80,
			status: 2,
		});
	});
	afterAll(async () => state.db.destroy());

	it("moves a domain with no port change and reloads both complete configs once", async () => {
		await state.db("access_list").insert({ id: 2, meta: JSON.stringify({ auth_type: "oauth2_proxy" }) });
		await state.db("proxy_host").where("id", 5).update({ access_list_id: 2 });
		const updated = await tor.update(access, await currentService(), { proxy_host_id: 5 });
		expect(updated.proxy_host_id).toBe(5);
		expect(await domainRows()).toEqual([
			{ proxy_host_id: 4, domain_name: "old.example.test" },
			{ proxy_host_id: 5, domain_name: "new.example.test" },
			{ proxy_host_id: 5, domain_name: onion },
		]);
		expect(access.can).toHaveBeenCalledWith("proxy_hosts:update", 4);
		expect(access.can).toHaveBeenCalledWith("proxy_hosts:update", 5);
		expect(state.generate.mock.calls.map(([, host]) => host.domain_names)).toEqual([
			["old.example.test"],
			["new.example.test", onion],
		]);
		expect(state.reload).toHaveBeenCalledOnce();
		expect(state.oauth).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
		expect(state.policy).toHaveBeenCalledOnce();
	});

	it("maps normalized domain rows after an actual Objection graph fetch", async () => {
		const host = await ProxyHost.query().findById(4).withGraphFetched("host_domains");
		expect(host.domain_names).toEqual(["old.example.test", onion]);
		expect(JSON.parse(JSON.stringify(host)).domain_names).toEqual(["old.example.test", onion]);
	});

	it("keeps disabled hosts disabled when rebuilding the reassigned configs", async () => {
		await state.db("proxy_host").where("id", 5).update({ enabled: 0 });
		await tor.update(access, await currentService(), { proxy_host_id: 5 });
		expect(state.generate.mock.calls.find(([, host]) => host.id === 5)[1].enabled).toBe(false);
		expect((await state.db("proxy_host").where("id", 5).first()).enabled).toBe(0);
	});

	it.each([4, 5])("does not mutate either host when host %s belongs to another user", async (id) => {
		await state.db("proxy_host").where("id", id).update({ owner_user_id: 8 });
		const before = await domainRows();
		await expect(tor.update(access, await currentService(), { proxy_host_id: 5 })).rejects.toMatchObject({
			status: 404,
		});
		expect((await currentService()).proxy_host_id).toBe(4);
		expect(await domainRows()).toEqual(before);
		expect(state.generate).not.toHaveBeenCalled();
	});

	it("removes the old onion domain when unlinking with zero", async () => {
		const updated = await tor.update(access, await currentService(), { proxy_host_id: 0 });
		expect(updated.proxy_host_id).toBe(0);
		expect((await domainRows()).some((row) => row.domain_name === onion)).toBe(false);
		expect(state.generate).toHaveBeenCalledOnce();
	});

	it("rolls back service and both domain changes if the service update fails", async () => {
		await state.db.raw(
			"CREATE TRIGGER reject_tor_update BEFORE UPDATE ON tor_onion BEGIN SELECT RAISE(ABORT, 'injected DB failure'); END",
		);
		const before = await domainRows();
		await expect(tor.update(access, await currentService(), { proxy_host_id: 5 })).rejects.toThrow(
			"injected DB failure",
		);
		expect((await currentService()).proxy_host_id).toBe(4);
		expect(await domainRows()).toEqual(before);
		expect(state.restore.mock.calls.map(([, host]) => host.id)).toEqual([4, 5]);
		expect(state.policy).not.toHaveBeenCalled();
	});

	it("restores both configs and database state when the reload fails", async () => {
		state.reload.mockRejectedValueOnce(new Error("injected reload failure"));
		const before = await domainRows();
		await expect(tor.update(access, await currentService(), { proxy_host_id: 5 })).rejects.toThrow(
			"injected reload failure",
		);
		expect((await currentService()).proxy_host_id).toBe(4);
		expect(await domainRows()).toEqual(before);
		expect(state.restore.mock.calls.map(([, host]) => host.id)).toEqual([4, 5]);
		expect(state.reload).toHaveBeenCalledTimes(2);
		expect(state.cleanup).not.toHaveBeenCalled();
	});

	it("rejects a transfer that would leave the previous host without domains", async () => {
		await state.db("host_domain").where("domain_name", "old.example.test").delete();
		await expect(tor.update(access, await currentService(), { proxy_host_id: 5 })).rejects.toThrow(
			"retain at least one domain",
		);
		expect((await currentService()).proxy_host_id).toBe(4);
		expect(state.reload).not.toHaveBeenCalled();
	});

	it("does not rewrite domains or configs for a name-only patch", async () => {
		const before = await domainRows();
		const updated = await tor.update(access, await currentService(), { name: "renamed" });
		expect(updated.name).toBe("renamed");
		expect(await domainRows()).toEqual(before);
		expect(state.reload).not.toHaveBeenCalled();
	});
});
