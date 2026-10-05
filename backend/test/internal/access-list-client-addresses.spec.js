import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, audit: vi.fn(), bulk: vi.fn(), reload: vi.fn(), push: vi.fn() }));
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
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: state.push } }));
vi.mock("../../internal/nginx.js", () => ({
	default: { bulkGenerateConfigs: state.bulk, reload: state.reload, withConfigurationLock: (callback) => callback() },
}));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { stop: vi.fn(), restart: vi.fn() } }));
vi.mock("../../internal/upload-relay.js", () => ({ validateRelayConfigForHost: vi.fn() }));

import service from "../../internal/access-list.js";
import Access from "../../lib/access.js";

const currentAccess = async () => {
	const access = new Access("acl-address-token-placeholder");
	await access.load();
	return access;
};

const snapshot = async () =>
	Object.fromEntries(
		await Promise.all(
			["access_list", "access_list_client", "access_list_auth"].map(async (table) => [
				table,
				await state.db(table).select("*").orderBy("id"),
			]),
		),
	);

describe("Access List mapped IPv6 validation before persistence", () => {
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
			for (const field of ["visibility", "access_lists", "proxy_hosts"]) table.string(field);
		});
		await state.db("user").insert({ id: 7, roles: "[]", is_deleted: 0, is_disabled: 0 });
		await state.db("user_permission").insert({
			user_id: 7,
			visibility: "user",
			access_lists: "manage",
			proxy_hosts: "hidden",
		});
		await state.db.schema.createTable("access_list", (table) => {
			table.increments("id");
			table.integer("owner_user_id");
			table.integer("is_deleted").defaultTo(0);
			table.string("name");
			table.text("meta");
			table.string("created_on");
			table.string("modified_on");
			for (const field of ["satisfy_any", "pass_auth", "mtls_enabled", "mtls_use_internal"]) table.integer(field);
			table.text("mtls_certificate");
		});
		for (const name of ["access_list_auth", "access_list_client"]) {
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("access_list_id");
				table.text("meta");
				table.string("created_on");
				table.string("modified_on");
				for (const field of name === "access_list_client"
					? ["address", "directive"]
					: ["username", "password"]) {
					table.string(field);
				}
			});
		}
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.integer("owner_user_id");
			table.integer("access_list_id");
			table.integer("is_deleted");
		});
	});
	beforeEach(async () => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
		vi.spyOn(service, "build").mockResolvedValue(undefined);
		for (const table of ["access_list_client", "access_list_auth", "access_list"]) await state.db(table).delete();
		await state.db("access_list").insert({
			id: 1,
			owner_user_id: 7,
			name: "Original",
			meta: "{}",
			created_on: "2026-10-05 00:00:00",
			modified_on: "2026-10-05 00:00:00",
		});
		await state.db("access_list_client").insert({ access_list_id: 1, address: "192.0.2.9", directive: "allow" });
	});
	afterAll(async () => {
		vi.restoreAllMocks();
		await state.db.destroy();
	});

	describe.each(["create", "update"])("%s", (method) => {
		it.each(["::ffff:192.0.2.1/95", "::ffff:192.0.2.1/0", "::FFFF:C000:0201/80"])(
			"rejects mapped prefix %s without changing any persisted list data or runtime state",
			async (address) => {
				const before = await snapshot();
				await expect(
					service[method](await currentAccess(), {
						...(method === "update" ? { id: 1 } : {}),
						name: "Must not persist",
						clients: [{ address, directive: "deny" }],
					}),
				).rejects.toMatchObject({ status: 400, message: expect.stringContaining("prefix of at least 96") });
				expect(await snapshot()).toEqual(before);
				expect(service.build).not.toHaveBeenCalled();
				expect(state.bulk).not.toHaveBeenCalled();
				expect(state.reload).not.toHaveBeenCalled();
				expect(state.audit).not.toHaveBeenCalled();
				expect(state.push).not.toHaveBeenCalled();
			},
		);

		it("preserves valid mapped boundaries and native IPv4/IPv6/all client values", async () => {
			const clients = [
				"::ffff:192.0.2.1",
				"::FFFF:C000:0201/128",
				"::ffff:192.0.2.19/120",
				"::ffff:192.0.2.1/96",
				"2001:0DB8::ABCD/64",
				"2001:db8::1/0",
				"192.0.2.19/24",
				"all",
			].map((address) => ({ address, directive: "deny" }));
			const result = await service[method](await currentAccess(), {
				...(method === "update" ? { id: 1 } : {}),
				name: "Valid client rules",
				clients,
			});
			expect(result.clients.map(({ address, directive }) => ({ address, directive }))).toEqual(clients);
			expect(
				await state
					.db("access_list_client")
					.select("address", "directive")
					.where("access_list_id", result.id)
					.orderBy("id"),
			).toEqual(clients);
			expect(service.build).toHaveBeenCalledOnce();
			expect(state.audit).toHaveBeenCalledOnce();
		});
	});
});
