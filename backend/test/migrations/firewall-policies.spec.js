import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20260803000000_add_firewall_policies.js";

let databaseDirectory;
let knex;

beforeEach(async () => {
	databaseDirectory = fs.mkdtempSync(join(tmpdir(), "shieldpm-firewall-migration-"));
	knex = Knex({
		client: "better-sqlite3",
		connection: { filename: join(databaseDirectory, "database.sqlite") },
		useNullAsDefault: true,
	});
	await knex.schema.createTable("proxy_host", (table) => {
		table.increments("id").primary();
	});
});

afterEach(async () => {
	await knex.destroy();
	fs.rmSync(databaseDirectory, { force: true, recursive: true });
});

describe("firewall policy migration", () => {
	it("removes the foreign key before rolling back the proxy-host column", async () => {
		await up(knex);
		expect(await knex.schema.hasTable("firewall_policy")).toBe(true);
		expect(await knex.schema.hasColumn("proxy_host", "firewall_policy_id")).toBe(true);

		await down(knex);
		expect(await knex.schema.hasTable("firewall_policy")).toBe(false);
		expect(await knex.schema.hasColumn("proxy_host", "firewall_policy_id")).toBe(false);
	});
});
