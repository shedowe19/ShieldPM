import Knex from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { down as downDdnsProvider, up as upDdnsProvider } from "../../migrations/20260121000000_add_ddns.js";
import {
	down as downChatIntegration,
	up as upChatIntegration,
} from "../../migrations/20260127000000_add_chat_integration.js";
import { down as downHostDomain, up as upHostDomain } from "../../migrations/20260222000000_normalize_domain_names.js";

const connections = [];

afterEach(async () => {
	await Promise.all(connections.splice(0).map((knex) => knex.destroy()));
});

const createKnex = () => {
	const knex = Knex({
		client: "better-sqlite3",
		connection: { filename: ":memory:" },
		useNullAsDefault: true,
	});
	connections.push(knex);
	return knex;
};

const foreignKeys = (knex, tableName) => knex.raw(`PRAGMA foreign_key_list("${tableName}")`);
const indexes = (knex, tableName) => knex.raw(`PRAGMA index_list("${tableName}")`);

describe("migration retry safety", () => {
	it("restores a DDNS foreign key after an interrupted multi-statement create", async () => {
		const knex = createKnex();
		await knex.schema.createTable("user", (table) => table.increments("id").primary());
		await upDdnsProvider(knex);
		await knex.schema.alterTable("ddns_provider", (table) => table.dropForeign("owner_user_id"));
		expect(await foreignKeys(knex, "ddns_provider")).toEqual([]);

		await upDdnsProvider(knex);
		await upDdnsProvider(knex);

		expect(await foreignKeys(knex, "ddns_provider")).toEqual([
			expect.objectContaining({ from: "owner_user_id", table: "user", to: "id" }),
		]);

		await downDdnsProvider(knex);
		await downDdnsProvider(knex);
		expect(await knex.schema.hasTable("ddns_provider")).toBe(false);
	});

	it("restores a chat foreign key after an interrupted multi-statement create", async () => {
		const knex = createKnex();
		await knex.schema.createTable("user", (table) => table.increments("id").primary());
		await upChatIntegration(knex);
		await knex.schema.alterTable("chat_integration", (table) => table.dropForeign("user_id"));
		expect(await foreignKeys(knex, "chat_integration")).toEqual([]);

		await upChatIntegration(knex);
		await upChatIntegration(knex);

		expect(await knex.schema.hasTable("chat_integration")).toBe(true);
		expect(await foreignKeys(knex, "chat_integration")).toEqual([
			expect.objectContaining({ from: "user_id", table: "user", to: "id" }),
		]);
		expect(Object.keys(await knex("chat_integration").columnInfo())).toEqual([
			"id",
			"created_on",
			"modified_on",
			"user_id",
			"provider",
			"token",
			"enabled",
			"config",
			"meta",
		]);

		await downChatIntegration(knex);
		await downChatIntegration(knex);
		expect(await knex.schema.hasTable("chat_integration")).toBe(false);
	});

	it("resumes a partial host-domain import without retaining or adding duplicates", async () => {
		const knex = createKnex();
		await knex.schema.createTable("proxy_host", (table) => {
			table.increments("id").primary();
			table.json("domain_names").notNullable();
		});
		await knex("proxy_host").insert({
			id: 1,
			domain_names: JSON.stringify(["ONE.example.com", "one.example.com", "two.example.com"]),
		});

		// This is the state left after the original migration created the table and
		// failed part-way through importing legacy domains.
		await knex.schema.createTable("host_domain", (table) => {
			table.increments("id").primary();
			table.integer("proxy_host_id").unsigned().notNullable();
			table.string("domain_name").notNullable();
			table.dateTime("created_on").notNullable().defaultTo(knex.fn.now());
			table.dateTime("modified_on").notNullable().defaultTo(knex.fn.now());
		});
		await knex("host_domain").insert([
			{ domain_name: "ONE.example.com", proxy_host_id: 1 },
			{ domain_name: "one.example.com", proxy_host_id: 1 },
		]);
		expect(await foreignKeys(knex, "host_domain")).toEqual([]);
		expect(await indexes(knex, "host_domain")).toEqual([]);

		await upHostDomain(knex);
		await upHostDomain(knex);

		expect(await foreignKeys(knex, "host_domain")).toEqual([
			expect.objectContaining({
				from: "proxy_host_id",
				on_delete: "CASCADE",
				on_update: "CASCADE",
				table: "proxy_host",
				to: "id",
			}),
		]);
		expect(await indexes(knex, "host_domain")).toEqual([
			expect.objectContaining({ name: "host_domain_domain_name_index", unique: 0 }),
		]);
		const rows = await knex("host_domain").select("proxy_host_id", "domain_name").orderBy("domain_name", "asc");
		expect(rows).toEqual([
			{ domain_name: "ONE.example.com", proxy_host_id: 1 },
			{ domain_name: "two.example.com", proxy_host_id: 1 },
		]);

		await downHostDomain(knex);
		await downHostDomain(knex);
		expect(await knex.schema.hasTable("host_domain")).toBe(false);
	});

	it("deduplicates legacy domains while creating the normalized table", async () => {
		const knex = createKnex();
		await knex.schema.createTable("proxy_host", (table) => {
			table.increments("id").primary();
			table.json("domain_names").notNullable();
		});
		await knex("proxy_host").insert({
			id: 1,
			domain_names: JSON.stringify(["Same.example.com", "same.example.com"]),
		});

		await upHostDomain(knex);
		await upHostDomain(knex);

		expect(await knex("host_domain").select("proxy_host_id", "domain_name")).toEqual([
			{ domain_name: "Same.example.com", proxy_host_id: 1 },
		]);
	});
});
