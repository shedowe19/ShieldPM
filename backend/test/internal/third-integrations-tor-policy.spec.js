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
import TorOnion from "../../models/tor_onion.js";

const onion = `${"a".repeat(56)}.onion`;
const access = { can: vi.fn(), token: { getUserId: () => 7 } };
const domainRows = () => state.db("host_domain").select("proxy_host_id", "domain_name").orderBy("id");
const currentService = () => TorOnion.query().findById(1);

describe("Tor delayed Anubis policy scheduling", () => {
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
		state.policy.mockReturnValue(undefined); // lodash debounce returns undefined on its first call
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

	it("completes a committed reassignment when the first debounced policy call returns undefined", async () => {
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
});
