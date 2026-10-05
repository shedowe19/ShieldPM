import fs from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, bulk: vi.fn(), generate: vi.fn() }));
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
vi.mock("../../models/token.js", () => ({
	default: () => {
		const payload = { attrs: { id: 7 }, scope: ["user"] };
		return {
			load: async () => payload,
			get: (key) => payload[key],
			hasScope: (scope) => payload.scope.includes(scope),
			getUserId: () => 7,
		};
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		bulkGenerateConfigs: state.bulk,
		generateConfig: state.generate,
		withConfigurationLock: (callback) => callback(),
		backupConfig: vi.fn(),
		deleteBackupConfig: vi.fn(),
		deleteConfig: vi.fn(),
		updateHostStatus: vi.fn(),
		reload: vi.fn(),
	},
}));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { stop: vi.fn(), restart: vi.fn() } }));
vi.mock("../../internal/certbot.js", () => ({}));
vi.mock("../../internal/pki.js", () => ({ default: {} }));
vi.mock("../../internal/upload-relay.js", () => ({ validateRelayConfigForHost: vi.fn() }));

import accessLists from "../../internal/access-list.js";
import certificates from "../../internal/certificate.js";
import Access from "../../lib/access.js";

const relations = {
	proxy_hosts: "proxy_host",
	redirection_hosts: "redirection_host",
	dead_hosts: "dead_host",
	streams: "stream",
};
const currentAccess = async (visibility, permissions = {}) => {
	await state
		.db("user_permission")
		.where("user_id", 7)
		.update({
			visibility,
			proxy_hosts: "view",
			redirection_hosts: "view",
			dead_hosts: "view",
			streams: "view",
			...permissions,
		});
	const access = new Access("host-expansion-token-placeholder");
	await access.load();
	return access;
};

describe("public host expansions respect real capability schemas and ownership", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("user", (table) => {
			table.integer("id").primary();
			table.json("roles");
			table.integer("is_deleted");
			table.integer("is_disabled");
		});
		await state.db.schema.createTable("user_permission", (table) => {
			table.increments("id");
			table.integer("user_id");
			for (const field of ["visibility", "access_lists", "certificates", ...Object.keys(relations)]) {
				table.string(field);
			}
		});
		await state.db("user").insert({ id: 7, roles: "[]", is_deleted: 0, is_disabled: 0 });
		await state.db("user_permission").insert({ user_id: 7, access_lists: "manage", certificates: "manage" });
		for (const name of ["access_list", "certificate", ...Object.values(relations)]) {
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("owner_user_id");
				table.integer("is_deleted").defaultTo(0);
				table.text("meta");
				table.string("created_on");
				table.string("modified_on");
				if (name === "access_list") table.string("name");
				else if (name === "certificate") table.string("nice_name");
				else {
					table.integer("certificate_id");
					table.string("note");
					table.integer("enabled");
					if (name !== "stream") {
						for (const field of ["ssl_forced", "http2_support", "hsts_enabled", "hsts_subdomains"]) {
							table.integer(field);
						}
					}
					if (name === "proxy_host") {
						table.integer("access_list_id");
						table.integer("upload_relay_enabled");
						table.string("forward_host");
					}
				}
			});
		}
		for (const name of ["access_list_auth", "access_list_client"]) {
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("access_list_id");
			});
		}
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
		});
	});
	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
		vi.spyOn(accessLists, "build").mockResolvedValue(undefined);
		for (const name of ["access_list", "certificate", ...Object.values(relations)]) await state.db(name).delete();
		await state.db("access_list").insert({ id: 1, owner_user_id: 7, name: "Own list", meta: "{}" });
		await state.db("certificate").insert({ id: 1, owner_user_id: 7, nice_name: "Own certificate", meta: "{}" });
		for (const name of Object.values(relations)) {
			for (const [id, ownerUserId, deleted] of [
				[11, 7, 0],
				[12, 8, 0],
				[13, 7, 1],
			]) {
				await state.db(name).insert({
					id,
					owner_user_id: ownerUserId,
					is_deleted: deleted,
					certificate_id: 1,
					enabled: 1,
					note: `Private note ${id}`,
					meta: JSON.stringify({ ip_firewall: { internal_note: `Private firewall note ${id}` } }),
					...(name === "proxy_host" ? { access_list_id: 1, forward_host: `private-${id}.test` } : {}),
				});
			}
		}
	});
	afterAll(async () => {
		vi.restoreAllMocks();
		await state.db.destroy();
	});

	it.each(["user", "all"])("limits Access List GET expansions with %s visibility", async (visibility) => {
		const row = await accessLists.get(await currentAccess(visibility), { id: 1, expand: ["proxy_hosts"] });
		expect(row.proxy_hosts.map((host) => host.id)).toEqual(visibility === "all" ? [11, 12] : [11]);
	});
	it("omits expanded proxy hosts when the user has no proxy-host capability", async () => {
		const row = await accessLists.get(await currentAccess("all", { proxy_hosts: "hidden" }), {
			id: 1,
			expand: ["proxy_hosts"],
		});
		expect(row.proxy_hosts).toEqual([]);
	});
	it.each(["user", "all"])(
		"keeps Access List GET-all's existing graph boundary with %s visibility",
		async (visibility) => {
			const access = await currentAccess(visibility);
			const rows = await accessLists.getAll(access);
			expect(rows).toHaveLength(1);
			expect(rows[0]).not.toHaveProperty("proxy_hosts");
			await expect(accessLists.getAll(access, ["proxy_hosts"])).rejects.toThrow("not allowed");
		},
	);
	it.each(["get", "getAll"])("independently scopes every Certificate %s host relation", async (method) => {
		for (const visibility of ["user", "all"]) {
			const access = await currentAccess(visibility);
			const expand = Object.keys(relations);
			const result =
				method === "get"
					? await certificates.get(access, { id: 1, expand })
					: await certificates.getAll(access, expand);
			const row = method === "get" ? result : result[0];
			for (const relation of expand) {
				expect(row[relation].map((host) => host.id)).toEqual(visibility === "all" ? [11, 12] : [11]);
			}
		}
	});
	it.each(["get", "getAll"])("removes only hidden Certificate %s host relations", async (method) => {
		for (const hiddenRelation of Object.keys(relations)) {
			const access = await currentAccess("all", { [hiddenRelation]: "hidden" });
			const expand = Object.keys(relations);
			const result =
				method === "get"
					? await certificates.get(access, { id: 1, expand })
					: await certificates.getAll(access, expand);
			const row = method === "get" ? result : result[0];
			for (const relation of expand) {
				expect(row[relation].map((host) => host.id)).toEqual(relation === hiddenRelation ? [] : [11, 12]);
			}
		}
	});
	it.each(["user", "all", "hidden"])(
		"rebuilds all assigned hosts but scopes the ACL update response for %s",
		async (policy) => {
			const access = await currentAccess(
				policy === "all" ? "all" : "user",
				policy === "hidden" ? { proxy_hosts: "hidden" } : {},
			);
			const result = await accessLists.update(access, { id: 1, name: "Changed" });
			expect(state.bulk).toHaveBeenCalledOnce();
			expect(state.bulk.mock.calls[0][2].map((host) => host.id)).toEqual([11, 12]);
			expect(result.proxy_hosts.map((host) => host.id)).toEqual(
				policy === "hidden" ? [] : policy === "all" ? [11, 12] : [11],
			);
		},
	);
	it("detaches and rebuilds foreign hosts when an ACL owner cannot view proxy hosts", async () => {
		vi.spyOn(fs.promises, "unlink").mockResolvedValue(undefined);
		await accessLists.delete(await currentAccess("user", { proxy_hosts: "hidden" }), { id: 1 });
		expect(state.bulk.mock.calls[0][2].map((host) => host.id)).toEqual([11, 12]);
		expect(await state.db("proxy_host").select("id", "access_list_id").where("is_deleted", 0)).toEqual([
			{ id: 11, access_list_id: 0 },
			{ id: 12, access_list_id: 0 },
		]);
	});
	it("retains all-owner Certificate cleanup for every host type", async () => {
		await state.db("certificate").where("id", 1).update({ is_deleted: 1 });
		await certificates.cleanUpMissingCertificates();
		for (const name of Object.values(relations)) {
			expect(await state.db(name).select("id", "certificate_id").where("is_deleted", 0)).toEqual([
				{ id: 11, certificate_id: 0 },
				{ id: 12, certificate_id: 0 },
			]);
		}
		expect(state.generate).toHaveBeenCalledTimes(8);
	});
});
