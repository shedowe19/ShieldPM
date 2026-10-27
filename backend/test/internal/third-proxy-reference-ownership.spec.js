import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));
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
vi.mock("../../internal/audit-log.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../internal/certbot.js", () => ({}));
vi.mock("../../internal/pki.js", () => ({ default: {} }));

import host from "../../internal/host.js";
import apiValidator from "../../lib/validator/api.js";
import common from "../../schema/common.json" with { type: "json" };

const access = (visibility) => ({
	can: vi.fn().mockResolvedValue({ permission_visibility: visibility }),
	token: { getUserId: () => 7 },
});

describe("host resource ownership through real service queries", () => {
	beforeAll(async () => {
		for (const name of ["certificate", "access_list"]) {
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("owner_user_id");
				table.integer("is_deleted");
				table.text("meta");
			});
			await state.db(name).insert([
				{ id: 1, owner_user_id: 7, is_deleted: 0, meta: "{}" },
				{ id: 2, owner_user_id: 8, is_deleted: 0, meta: "{}" },
				{ id: 3, owner_user_id: 7, is_deleted: 1, meta: "{}" },
			]);
		}
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.integer("access_list_id");
			table.integer("is_deleted");
		});
	});
	afterAll(async () => state.db.destroy());
	it.each(["certificate_id", "access_list_id"])("permits the owner's %s", async (field) => {
		await expect(host.validateReferences(access("user"), { [field]: 1 })).resolves.toBeUndefined();
	});
	it.each([0, "0"])("accepts a cleared certificate reference %s through the actual API validator", async (id) => {
		const data = await apiValidator(
			{ type: "object", properties: { certificate_id: common.properties.certificate_id } },
			{ certificate_id: id, ssl_forced: true, hsts_enabled: true, hsts_subdomains: true },
		);
		await expect(host.validateReferences(access("user"), data)).resolves.toBeUndefined();
		expect(host.cleanSslHstsData(false, data)).toMatchObject({
			certificate_id: 0,
			ssl_forced: false,
			hsts_enabled: false,
			hsts_subdomains: false,
		});
	});
	it.each(["certificate_id", "access_list_id"])("accepts a legacy string zero for %s", async (field) => {
		const user = access("user");
		await expect(host.validateReferences(user, { [field]: "0" })).resolves.toBeUndefined();
		expect(user.can).not.toHaveBeenCalled();
	});
	it.each(["certificate_id", "access_list_id"])(
		"keeps string references subject to owner authorization for %s",
		async (field) => {
			await expect(host.validateReferences(access("user"), { [field]: "1" })).resolves.toBeUndefined();
			await expect(host.validateReferences(access("user"), { [field]: "2" })).rejects.toMatchObject({
				status: 404,
			});
			await expect(host.validateReferences(access("all"), { [field]: "3" })).rejects.toMatchObject({
				status: 404,
			});
		},
	);
	it.each(["certificate_id", "access_list_id"])("rejects another owner's %s", async (field) => {
		await expect(host.validateReferences(access("user"), { [field]: 2 })).rejects.toMatchObject({ status: 404 });
	});
	it.each(["certificate_id", "access_list_id"])(
		"permits %s from other owners for global visibility",
		async (field) => {
			await expect(host.validateReferences(access("all"), { [field]: 2 })).resolves.toBeUndefined();
		},
	);
	it.each(["certificate_id", "access_list_id"])("rejects deleted %s even with global visibility", async (field) => {
		await expect(host.validateReferences(access("all"), { [field]: 3 })).rejects.toMatchObject({ status: 404 });
	});
});
