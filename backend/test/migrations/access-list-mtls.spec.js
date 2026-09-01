import Knex from "knex";
import { afterEach, describe, expect, it, vi } from "vitest";
import { down, up } from "../../migrations/20260105000000_add_access_list_mtls.js";

const connections = [];

afterEach(async () => {
	await Promise.all(connections.splice(0).map((knex) => knex.destroy()));
});

describe("access-list mTLS migration", () => {
	it("migrates string metadata and leaves invalid JSON untouched", async () => {
		const knex = Knex({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		connections.push(knex);
		await knex.schema.createTable("access_list", (table) => {
			table.increments("id").primary();
			table.json("meta").notNullable();
		});
		await knex("access_list").insert([
			{
				id: 1,
				meta: JSON.stringify({ keep: "value", mtls_certificate: "certificate", mtls_enabled: true }),
			},
			{ id: 2, meta: "invalid json" },
			{ id: 3, meta: JSON.stringify({ keep: "disabled", mtls_enabled: false }) },
		]);

		await up(knex);
		await up(knex);

		const migrated = await knex("access_list").where("id", 1).first();
		const invalid = await knex("access_list").where("id", 2).first();
		const disabled = await knex("access_list").where("id", 3).first();
		expect(migrated).toMatchObject({ mtls_certificate: "certificate", mtls_enabled: 1 });
		expect(JSON.parse(migrated.meta)).toEqual({ keep: "value" });
		expect(invalid).toMatchObject({ meta: "invalid json", mtls_certificate: "", mtls_enabled: 0 });
		expect(disabled).toMatchObject({ mtls_certificate: "", mtls_enabled: 0 });
		expect(JSON.parse(disabled.meta)).toEqual({ keep: "disabled" });
	});

	it("accepts PostgreSQL-decoded JSON objects without mutating them", async () => {
		const decodedMeta = {
			keep: { nested: true },
			mtls_certificate: "certificate",
			mtls_enabled: true,
		};
		const update = vi.fn().mockResolvedValue(1);
		const where = vi.fn(() => ({ update }));
		const select = vi.fn().mockResolvedValue([
			{ id: 1, meta: decodedMeta },
			{ id: 2, meta: ["invalid"] },
			{ id: 3, meta: null },
			{ id: 4, meta: { mtls_certificate: { invalid: true } } },
		]);
		const database = vi.fn(() => ({ select, where }));
		database.schema = {
			hasColumn: vi.fn().mockResolvedValue(true),
			table: vi.fn(),
		};

		await up(database);

		expect(update).toHaveBeenCalledTimes(1);
		expect(where).toHaveBeenCalledWith("id", 1);
		expect(update).toHaveBeenCalledWith({
			meta: JSON.stringify({ keep: { nested: true } }),
			mtls_certificate: "certificate",
			mtls_enabled: true,
		});
		expect(decodedMeta).toEqual({
			keep: { nested: true },
			mtls_certificate: "certificate",
			mtls_enabled: true,
		});
	});

	it("preserves partially pre-existing columns when rollback ownership is ambiguous", async () => {
		const knex = Knex({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		connections.push(knex);
		await knex.schema.createTable("access_list", (table) => {
			table.increments("id").primary();
			table.json("meta").notNullable();
			table.boolean("mtls_enabled").notNullable().defaultTo(false);
		});
		await knex("access_list").insert({
			id: 1,
			meta: JSON.stringify({ keep: "legacy" }),
			mtls_enabled: true,
		});

		await up(knex);
		await down(knex);

		await expect(knex.schema.hasColumn("access_list", "mtls_enabled")).resolves.toBe(true);
		await expect(knex.schema.hasColumn("access_list", "mtls_certificate")).resolves.toBe(true);
		await expect(knex("access_list").where("id", 1).first()).resolves.toMatchObject({
			mtls_certificate: "",
			mtls_enabled: 1,
		});
	});
});
