import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { up } from "../../migrations/20260104000000_fix_req_limit_columns.js";

describe("request-limit column repair migration", () => {
	let knex;

	beforeEach(async () => {
		knex = Knex({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		await knex.schema.createTable("proxy_host", (table) => {
			table.increments("id").primary();
			table.integer("adv_limit_req_rate").nullable().defaultTo(null);
		});
	});

	afterEach(async () => {
		await knex.destroy();
	});

	it("repairs a partially migrated table and remains retry-safe", async () => {
		await up(knex);
		await up(knex);

		for (const column of ["adv_limit_req_rate", "adv_limit_req_unit", "adv_limit_req_burst"]) {
			expect(await knex.schema.hasColumn("proxy_host", column)).toBe(true);
		}
	});

	it("preflights existing columns instead of relying on caught DDL errors", async () => {
		const schema = {
			hasColumn: vi.fn(async () => true),
			table: vi.fn(() => {
				throw Object.assign(new Error("column already exists"), { code: "42701" });
			}),
		};

		await expect(up({ schema })).resolves.toBeUndefined();
		expect(schema.hasColumn).toHaveBeenCalledTimes(3);
		expect(schema.table).not.toHaveBeenCalled();
	});
});
