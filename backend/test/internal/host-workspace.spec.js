import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite", activation: vi.fn() }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: () => "2".repeat(64),
	isSqlite: () => state.engine === "sqlite",
	isPostgres: () => state.engine === "postgres",
}));
vi.mock("../../internal/host-revisions.js", () => ({ default: { record: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({
	default: { withConfigurationLock: (callback) => callback(), bulkGenerateConfigGroupsUnlocked: state.activation },
}));

import service, { profileFields } from "../../internal/host-workspace.js";
import errs from "../../lib/error.js";
import { down, up } from "../../migrations/20261017190600_host_workspace.js";
import { getCompiledSchema } from "../../schema/index.js";

const access = (owner = 1, all = false) => ({
	token: { getUserId: () => owner },
	can: vi.fn().mockResolvedValue({ permission_visibility: all ? "all" : "user" }),
});
describe.each(["sqlite", "postgres"])("host workspace on %s", (engine) => {
	let embedded;
	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		await getCompiledSchema();
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.integer("owner_user_id");
			table.integer("is_deleted").defaultTo(0);
			table.integer("enabled").defaultTo(1);
			table.integer("certificate_id").defaultTo(0);
			table.string("created_on");
			table.string("modified_on");
			table.string("maintenance_start");
			table.string("maintenance_end");
			for (const field of profileFields) {
				if (["bandwidth_limit", "adv_limit_req_unit"].includes(field)) table.string(field);
				else table.integer(field).defaultTo(0);
			}
		});
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
		});
		await state.db.schema.createTable("certificate", (table) => {
			table.increments("id");
			table.integer("is_deleted").defaultTo(0);
			table.string("expires_on");
		});
		await state.db.schema.createTable("proxy_host_monitor", (table) => {
			table.increments("id");
			table.integer("host_id").notNullable().unique();
			table.boolean("enabled").notNullable().defaultTo(false);
			table.string("state");
		});
		await up(state.db);
	});
	beforeEach(async () => {
		state.activation.mockReset().mockResolvedValue([]);
		for (const table of [
			"proxy_host_tag",
			"host_workspace_item",
			"host_domain",
			"proxy_host_monitor",
			"proxy_host",
			"certificate",
		])
			await state.db(table).delete();
		await state.db("proxy_host").insert([
			{ id: 1, owner_user_id: 1, modified_on: "2026-10-17T12:00:00Z" },
			{ id: 2, owner_user_id: 2, modified_on: "2026-10-17T12:00:00Z" },
			{ id: 3, owner_user_id: 1, modified_on: "2026-10-17T12:00:00Z" },
		]);
		await state.db("host_domain").insert([
			{ proxy_host_id: 1, domain_name: "media.example.test" },
			{ proxy_host_id: 2, domain_name: "private.example.test" },
			{ proxy_host_id: 3, domain_name: "internal.example.test" },
		]);
	});
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => {
		await down(state.db);
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});
	it("isolates host projections, tags and private saved views while combining filters before pagination", async () => {
		const user = access();
		await service.setTags(user, 1, ["MEDIA", "prod", "prod"]);
		expect((await service.hosts(user, { tags: ["media"], page: 1, limit: 1 })).items).toEqual([
			{ id: 1, enabled: true, domain_names: ["media.example.test"], tags: ["media", "prod"] },
		]);
		expect((await service.hosts(user, {})).pagination.total_items).toBe(2);
		await expect(service.setTags(user, 2, ["stolen"])).rejects.toBeInstanceOf(errs.ItemNotFoundError);
		await service.save(user, { kind: "view", name: "Production", definition: { tags: ["prod"] } });
		expect(await service.list(access(2))).toEqual([]);
		const options = await service.options(user);
		expect(options).toHaveLength(2);
		expect(Object.keys(options[0]).sort()).toEqual(["domain_names", "id"]);
	});
	it("filters effective monitoring states before pagination without exposing private or deleted hosts", async () => {
		await state.db("proxy_host").insert(
			Array.from({ length: 10 }, (_, index) => ({
				id: index + 4,
				owner_user_id: 1,
				modified_on: "2026-10-17T12:00:00Z",
				enabled: [5, 8, 9, 11, 13].includes(index + 4) ? 0 : 1,
				is_deleted: index + 4 === 12 ? 1 : 0,
			})),
		);
		await state.db("host_domain").insert(
			Array.from({ length: 10 }, (_, index) => ({
				proxy_host_id: index + 4,
				domain_name: `host-${index + 4}.example.test`,
			})),
		);
		await state.db("proxy_host_monitor").insert([
			{ host_id: 1, enabled: true, state: "up" },
			{ host_id: 2, enabled: false, state: "up" },
			{ host_id: 3, enabled: true, state: "down" },
			{ host_id: 4, enabled: true, state: "unknown" },
			{ host_id: 5, enabled: true, state: "up" },
			{ host_id: 6, enabled: false, state: "down" },
			{ host_id: 7, enabled: false, state: "unknown" },
			{ host_id: 8, enabled: true, state: "down" },
			{ host_id: 9, enabled: false, state: "up" },
			{ host_id: 12, enabled: true, state: "up" },
			{ host_id: 13, enabled: true, state: "unknown" },
		]);
		const user = access();
		for (const [monitor, ids] of Object.entries({
			up: [1],
			down: [3],
			unknown: [4, 10],
			paused: [5, 6, 7, 8, 9, 11, 13],
		})) {
			const result = await service.hosts(user, { monitor });
			expect(result.items.map((item) => item.id)).toEqual(ids);
			expect(result.pagination.total_items).toBe(ids.length);
		}
		const page = await service.hosts(user, { monitor: "paused", page: 2, limit: 2 });
		expect(page.items.map((item) => item.id)).toEqual([7, 8]);
		expect(page.pagination).toMatchObject({ total_items: 7, total_pages: 4 });
		expect((await service.hosts(user, { monitor: "paused", enabled: true })).items.map((item) => item.id)).toEqual([
			6, 7,
		]);
		expect((await service.hosts(user, { monitor: "unknown", enabled: false })).items).toEqual([]);
		expect((await service.hosts(access(1, true), { monitor: "paused" })).items.map((item) => item.id)).toEqual([
			2, 5, 6, 7, 8, 9, 11, 13,
		]);
		await state.db("proxy_host_monitor").where("host_id", 2).delete();
		expect((await service.hosts(user, { monitor: "unknown" })).items.map((item) => item.id)).toEqual([4, 10]);
		expect((await service.hosts(access(1, true), { monitor: "unknown" })).items.map((item) => item.id)).toEqual([
			2, 4, 10,
		]);
	});
	it("reclassifies saved observations immediately when host or monitor switches change", async () => {
		await state.db("proxy_host_monitor").insert({ host_id: 1, enabled: true, state: "up" });
		const user = access();
		expect((await service.hosts(user, { monitor: "up" })).items.map((item) => item.id)).toEqual([1]);
		await state.db("proxy_host").where("id", 1).update({ enabled: 0 });
		expect((await service.hosts(user, { monitor: "up" })).items).toEqual([]);
		expect((await service.hosts(user, { monitor: "paused" })).items.map((item) => item.id)).toEqual([1]);
		await state.db("proxy_host").where("id", 1).update({ enabled: 1 });
		await state.db("proxy_host_monitor").where("host_id", 1).update({ enabled: false });
		expect((await service.hosts(user, { monitor: "up" })).items).toEqual([]);
		expect((await service.hosts(user, { monitor: "paused" })).items.map((item) => item.id)).toEqual([1]);
		await state.db("proxy_host_monitor").where("host_id", 1).update({ enabled: true });
		expect((await service.hosts(user, { monitor: "up" })).items.map((item) => item.id)).toEqual([1]);
		await state.db("proxy_host_monitor").where("host_id", 1).delete();
		expect((await service.hosts(user, { monitor: "unknown" })).items.map((item) => item.id)).toEqual([1, 3]);
		expect((await service.hosts(user, { monitor: "paused" })).items).toEqual([]);
	});
	it("reports duplicate saved names consistently while keeping names private per owner and kind", async () => {
		const user = access();
		await service.save(user, { kind: "view", name: "Production", definition: { tags: ["prod"] } });
		await expect(
			service.save(user, { kind: "view", name: "Production", definition: { tags: ["other"] } }),
		).rejects.toBeInstanceOf(errs.ValidationError);
		await service.save(access(2), { kind: "view", name: "Production", definition: {} });
		await service.save(user, {
			kind: "profile",
			name: "Production",
			definition: { settings: { block_exploits: true } },
		});
		await expect(
			service.save(user, {
				kind: "profile",
				name: "Production",
				definition: { settings: { block_exploits: false } },
			}),
		).rejects.toThrow("already exists");
	});

	it("previews each permission and activates accepted hosts through one validated batch", async () => {
		const user = access();
		const profile = await service.save(user, {
			kind: "profile",
			name: "Protected",
			definition: { settings: { block_exploits: true, adv_limit_req_rate: 10, adv_limit_req_unit: "s" } },
		});
		const preview = await service.preview(user, profile.id, [1, 2, 3]);
		expect(preview.results.map((row) => row.ready)).toEqual([true, false, true]);
		expect((await state.db("proxy_host").where("id", 1).first()).block_exploits).toBe(0);
		const result = await service.apply(user, preview.plan);
		expect(result.activated).toBe(true);
		expect(state.activation).toHaveBeenCalledOnce();
		expect(state.activation.mock.calls[0][0][0].hosts.map((host) => host.id)).toEqual([1, 3]);
		expect(Number((await state.db("proxy_host").where("id", 1).first()).block_exploits)).toBe(1);
		expect(Number((await state.db("proxy_host").where("id", 2).first()).block_exploits)).toBe(0);
	});
	it("binds plans to owner, expiry, exact profile and current host state", async () => {
		const user = access();
		const profile = await service.save(user, {
			kind: "profile",
			name: "Policy",
			definition: { settings: { block_exploits: true } },
		});
		const preview = await service.preview(user, profile.id, [1]);
		await expect(service.apply(access(2), preview.plan)).rejects.toThrow("Invalid bulk plan");
		await expect(service.apply(user, `${preview.plan}tampered`)).rejects.toThrow("Invalid bulk plan");
		vi.spyOn(Date, "now").mockReturnValue(Date.now() + 600000);
		await expect(service.apply(user, preview.plan)).rejects.toThrow("expired");
		vi.restoreAllMocks();
		await state.db("proxy_host").where("id", 1).update({ modified_on: "changed" });
		const result = await service.apply(user, preview.plan);
		expect(result.results[0].success).toBe(false);
		expect(state.activation).not.toHaveBeenCalled();
	});
	it("restores only written fields when activation fails and does not overwrite unrelated concurrent edits", async () => {
		const user = access();
		const profile = await service.save(user, {
			kind: "profile",
			name: "Policy",
			definition: { settings: { block_exploits: true } },
		});
		const preview = await service.preview(user, profile.id, [1, 3]);
		state.activation.mockImplementation(async () => {
			await state.db("proxy_host").where("id", 1).update({ bandwidth_limit: "2m" });
			throw new Error("bad config");
		});
		const result = await service.apply(user, preview.plan);
		expect(result.activated).toBe(false);
		expect(Number((await state.db("proxy_host").where("id", 1).first()).block_exploits)).toBe(0);
		expect((await state.db("proxy_host").where("id", 1).first()).bandwidth_limit).toBe("2m");
	});
	it("rejects unsupported profile fields, unsafe bandwidth and TLS profiles without a certificate", async () => {
		const user = access();
		await expect(
			service.save(user, { kind: "view", name: "Bad", definition: { settings: { block_exploits: true } } }),
		).rejects.toThrow();
		await expect(
			service.save(user, {
				kind: "profile",
				name: "Bad",
				definition: { settings: { advanced_config: "injected" } },
			}),
		).rejects.toThrow("unsupported");
		await expect(
			service.save(user, {
				kind: "profile",
				name: "Bad",
				definition: { settings: { bandwidth_limit: "1m; injected" } },
			}),
		).rejects.toThrow("Bandwidth");
		const profile = await service.save(user, {
			kind: "profile",
			name: "TLS",
			definition: { settings: { ssl_forced: true } },
		});
		const preview = await service.preview(user, profile.id, [1]);
		expect(preview.plan).toBeNull();
		expect(preview.results[0].error).toContain("certificate");
	});
});
