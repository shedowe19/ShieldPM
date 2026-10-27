import knex from "knex";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20261027150000_remove_retired_host_runtime.js";
import { createPostgres } from "../helpers/postgres.js";

describe.each(["sqlite", "postgres"])("retired host metadata migration on %s", (engine) => {
	let db;
	let embedded;
	beforeAll(async () => {
		if (engine === "postgres") {
			embedded = await createPostgres();
			db = embedded.database;
		} else db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	});
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await db.destroy();
	});
	it("accepts a historical database that has no proxy hosts table", async () => {
		await expect(up(db)).resolves.toEqual([]);
	});
	it("cleans every paginated host including deleted rows and zero ID without changing other fields", async () => {
		await db.schema.createTable("proxy_host", (table) => {
			table.integer("id").primary();
			table.integer("is_deleted");
			table.integer("enabled");
			table.string("modified_on");
			table.json("meta");
		});
		const metadata = {
			wasm_filters: [{ enabled: true, config: { sealed_value: "retired ciphertext" } }],
			wasmFilters: ["legacy"],
			wasm_status: { state: "active" },
			wasmStatus: "active",
			ip_firewall: { enabled: true, list_ids: [5] },
			nginx_online: true,
			note: "retain unchanged",
			custom: { wasm_filters: "unrelated nested data" },
		};
		for (let id = 0; id < 255; id++)
			await db("proxy_host").insert({
				id,
				is_deleted: id % 2,
				enabled: 1,
				modified_on: "unchanged",
				meta: JSON.stringify(metadata),
			});
		const disabled = await db.transaction(up);
		expect(disabled).toEqual(Array.from({ length: 255 }, (_entry, id) => id));
		const rows = await db("proxy_host").orderBy("id");
		expect(rows).toHaveLength(255);
		for (const row of rows) {
			expect(row.is_deleted).toBe(row.id % 2);
			expect(row.modified_on).toBe("unchanged");
			expect(row.enabled).toBe(0);
			expect(typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta).toEqual({
				ip_firewall: metadata.ip_firewall,
				nginx_online: false,
				note: "retain unchanged",
				custom: metadata.custom,
			});
		}
		await db.transaction(up);
		await down(db);
		expect(await db("proxy_host").orderBy("id")).toEqual(rows);
	});
	it("leaves hosts without an active binding enabled and preserves their unrelated metadata", async () => {
		await db("proxy_host").insert({
			id: 300,
			enabled: 1,
			is_deleted: 0,
			modified_on: "keep",
			meta: JSON.stringify({ wasm_filters: [{ enabled: false }], note: "disabled filter" }),
		});
		await db("proxy_host").insert({
			id: 301,
			enabled: 1,
			is_deleted: 0,
			modified_on: "keep",
			meta: JSON.stringify({ wasmFilters: [], nginx_online: true }),
		});
		await db("proxy_host").insert({
			id: 302,
			enabled: 0,
			is_deleted: 1,
			modified_on: "keep",
			meta: JSON.stringify({ note: "ordinary disabled host" }),
		});
		await expect(db.transaction(up)).resolves.toEqual([]);
		for (const id of [300, 301]) expect((await db("proxy_host").where("id", id).first()).enabled).toBe(1);
		expect((await db("proxy_host").where("id", 302).first()).enabled).toBe(0);
		const meta = (await db("proxy_host").where("id", 301).first()).meta;
		expect(typeof meta === "string" ? JSON.parse(meta) : meta).toEqual({ nginx_online: true });
	});
	it("cleans double-encoded metadata and disables ambiguous binding objects", async () => {
		await db("proxy_host").insert({
			id: 400,
			enabled: 1,
			is_deleted: 0,
			meta: JSON.stringify(JSON.stringify({ note: "double encoded", wasm_filters: [{ enabled: true }] })),
		});
		await db("proxy_host").insert({
			id: 401,
			enabled: 1,
			is_deleted: 0,
			meta: JSON.stringify({ note: "ambiguous", wasm_filters: { enabled: true } }),
		});
		await expect(db.transaction(up)).resolves.toEqual([400, 401]);
		for (const id of [400, 401]) {
			const row = await db("proxy_host").where("id", id).first();
			expect(row.enabled).toBe(0);
			expect(typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta).toEqual({
				note: id === 400 ? "double encoded" : "ambiguous",
				nginx_online: false,
			});
		}
	});
});
