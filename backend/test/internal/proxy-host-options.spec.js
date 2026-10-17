import { Model } from "objection";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite" }));
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

import options from "../../internal/proxy-host-options.js";

const access = (all = false) => ({
	token: { getUserId: () => 1 },
	can: vi.fn().mockResolvedValue({ permission_visibility: all ? "all" : "user" }),
});

describe.each(["sqlite", "postgres"])("authorized proxy host selectors on %s", (engine) => {
	let embedded;
	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.integer("owner_user_id");
			table.integer("is_deleted").defaultTo(0);
			table.text("meta");
			table.text("git_credentials");
			table.text("terminal_password");
		});
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
		});
	});
	beforeEach(async () => {
		await state.db("host_domain").delete();
		await state.db("proxy_host").delete();
		await state.db("proxy_host").insert([
			{ id: 1, owner_user_id: 1, is_deleted: 0, meta: "deliberately-not-json", git_credentials: "private-git-value" },
			{ id: 2, owner_user_id: 2, is_deleted: 0, terminal_password: "private-terminal-value" },
			{ id: 3, owner_user_id: 1, is_deleted: 1 },
		]);
		await state.db("host_domain").insert([
			{ proxy_host_id: 1, domain_name: "media.example.test" },
			{ proxy_host_id: 1, domain_name: "alias.example.test" },
			{ proxy_host_id: 2, domain_name: "private.example.test" },
			{ proxy_host_id: 3, domain_name: "deleted.example.test" },
		]);
	});
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});
	it("returns only owned IDs and domains without loading runtime metadata or credentials", async () => {
		const user = access();
		expect(await options.get(user)).toEqual([
			{ id: 1, domain_names: ["media.example.test", "alias.example.test"] },
		]);
		expect(user.can).toHaveBeenCalledWith("proxy_hosts:list");
	});
	it("keeps deleted hosts private while granting all-host access only to the corresponding capability", async () => {
		expect((await options.get(access(true))).map(({ id }) => id)).toEqual([1, 2]);
	});
	it("searches authorized domain labels without expanding query wildcards", async () => {
		expect(await options.get(access(), "private")).toEqual([]);
		expect((await options.get(access(), "alias")).map(({ id }) => id)).toEqual([1]);
		expect(await options.get(access(), "missing%_")).toEqual([]);
	});
	it("checks the capability before reading any host data", async () => {
		const user = access();
		const denied = new Error("permission denied");
		user.can.mockRejectedValue(denied);
		await expect(options.get(user)).rejects.toBe(denied);
	});
});
