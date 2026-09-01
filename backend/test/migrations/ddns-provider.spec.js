import Knex from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { defineTable, down, up } from "../../migrations/20260121000000_add_ddns.js";

const connections = [];

afterEach(async () => {
	await Promise.all(connections.splice(0).map((knex) => knex.destroy()));
});

const createKnex = (client, options = {}) => {
	const knex = Knex({ client, ...options });
	connections.push(knex);
	return knex;
};

describe("DDNS provider migration", () => {
	it.each([
		["mysql2", /`meta` json not null(?:,|\))/],
		["pg", /"meta" json not null(?:,|\))/],
		["better-sqlite3", /`meta` json not null(?:,|\))/],
	])("compiles a portable required meta document for %s", (client, expectedMetaDefinition) => {
		const knex = createKnex(client, client === "better-sqlite3" ? { useNullAsDefault: true } : {});
		const statements = knex.schema
			.createTable("ddns_provider", defineTable)
			.toSQL()
			.map(({ sql }) => sql)
			.join("\n");

		expect(statements).toMatch(expectedMetaDefinition);
		expect(statements).not.toMatch(/(?:`meta`|"meta") json not null default/i);
		expect(statements).not.toContain("default '{}'");
	});

	it("requires callers to provide meta explicitly on SQLite", async () => {
		const knex = createKnex("better-sqlite3", {
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		await knex.schema.createTable("user", (table) => table.increments("id").primary());
		await knex("user").insert({ id: 1 });
		await up(knex);
		await up(knex);

		const provider = {
			config: JSON.stringify({ token: "secret" }),
			created_on: "2026-09-01 00:00:00",
			domains: JSON.stringify(["ddns.example.com"]),
			modified_on: "2026-09-01 00:00:00",
			name: "Example",
			owner_user_id: 1,
			provider: "duckdns",
		};

		await expect(knex("ddns_provider").insert(provider)).rejects.toThrow(/not null/i);
		await knex("ddns_provider").insert({ ...provider, meta: JSON.stringify({}) });

		const row = await knex("ddns_provider").select("meta").first();
		const columns = await knex("ddns_provider").columnInfo();
		expect(row.meta).toBe("{}");
		expect(columns.meta.nullable).toBe(false);
		expect(columns.meta.defaultValue).toBeNull();

		await down(knex);
		await down(knex);
		expect(await knex.schema.hasTable("ddns_provider")).toBe(false);
	});
});
