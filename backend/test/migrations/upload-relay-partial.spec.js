import knex from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20260919000000_add_proxy_host_upload_relay.js";

const databases = [];

afterEach(async () => {
	for (const database of databases.splice(0)) await database.destroy();
});

describe("upload relay migration recovery", () => {
	it("adds every missing relay column when a previous attempt already created the first column", async () => {
		const database = knex({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		databases.push(database);
		await database.schema.createTable("proxy_host", (table) => {
			table.increments("id").primary();
			table.boolean("upload_relay_enabled").notNullable().defaultTo(false);
		});

		await up(database);

		for (const column of [
			"upload_relay_enabled",
			"upload_relay_chunk_size",
			"upload_relay_cleanup_hours",
			"upload_relay_max_file_size",
			"upload_relay_max_pending_bytes",
			"upload_relay_path",
			"upload_relay_target_path",
		]) {
			expect(await database.schema.hasColumn("proxy_host", column)).toBe(true);
		}

		await down(database);
		expect(await database.schema.hasColumn("proxy_host", "upload_relay_enabled")).toBe(false);
	});
});
