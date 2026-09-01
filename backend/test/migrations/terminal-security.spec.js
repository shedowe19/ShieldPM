import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20260831140000_terminal_security.js";

let knex;

beforeEach(async () => {
	knex = Knex({
		client: "better-sqlite3",
		connection: { filename: ":memory:" },
		useNullAsDefault: true,
	});
	await knex.schema.createTable("proxy_host", (table) => {
		table.increments("id").primary();
		table.string("forward_scheme").notNullable();
		table.boolean("enabled").notNullable().defaultTo(true);
	});
	await knex.schema.createTable("access_list", (table) => table.increments("id").primary());
});

afterEach(async () => {
	await knex.destroy();
});

describe("terminal security migration", () => {
	it("adds trust columns idempotently and disables legacy terminal hosts", async () => {
		await knex("proxy_host").insert([
			{ forward_scheme: "terminal", enabled: 1 },
			{ forward_scheme: "http", enabled: 1 },
		]);

		await up(knex);
		await up(knex);

		expect(await knex.schema.hasColumn("proxy_host", "terminal_host_key_fingerprint")).toBe(true);
		expect(await knex.schema.hasColumn("proxy_host", "terminal_gateway_secret")).toBe(true);
		expect(await knex.schema.hasColumn("access_list", "revision")).toBe(true);
		expect(await knex("proxy_host").select("forward_scheme", "enabled").orderBy("id")).toEqual([
			{ forward_scheme: "terminal", enabled: 0 },
			{ forward_scheme: "http", enabled: 1 },
		]);
	});

	it("removes only the migration-owned columns on rollback", async () => {
		await up(knex);
		await down(knex);

		expect(await knex.schema.hasColumn("proxy_host", "terminal_host_key_fingerprint")).toBe(false);
		expect(await knex.schema.hasColumn("proxy_host", "terminal_gateway_secret")).toBe(false);
		expect(await knex.schema.hasColumn("access_list", "revision")).toBe(false);
		expect(await knex.schema.hasColumn("proxy_host", "forward_scheme")).toBe(true);
	});
});
