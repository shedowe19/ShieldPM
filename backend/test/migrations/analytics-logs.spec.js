import Knex from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20251231000000_analytics_logs.js";

const connections = [];

afterEach(async () => {
	await Promise.all(connections.splice(0).map((knex) => knex.destroy()));
});

const createKnex = (client, options = {}) => {
	const knex = Knex({ client, ...options });
	connections.push(knex);
	return knex;
};

describe("analytics logs migration", () => {
	it.each([
		[
			"mysql2",
			/`created_at` bigint default \(CAST\(UNIX_TIMESTAMP\(CURRENT_TIMESTAMP\(3\)\) \* 1000 AS UNSIGNED\)\)/,
		],
		["pg", /"created_at" bigint default \(FLOOR\(EXTRACT\(EPOCH FROM CURRENT_TIMESTAMP\) \* 1000\)::BIGINT\)/],
	])("compiles an epoch-millisecond default for %s", (client, expectedDefault) => {
		const knex = createKnex(client);
		const statements = up(knex)
			.toSQL()
			.map(({ sql }) => sql)
			.join("\n");

		expect(statements).toMatch(expectedDefault);
	});

	it("stores an integer epoch-millisecond default on SQLite", async () => {
		const knex = createKnex("better-sqlite3", {
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		await up(knex);

		const beforeInsert = Date.now();
		await knex("analytics_logs").insert({
			host_id: 1,
			time: "2026-08-31T20:00:00.000Z",
		});
		const afterInsert = Date.now();
		const row = await knex("analytics_logs")
			.select("created_at")
			.select(knex.raw("typeof(created_at) AS created_at_type"))
			.first();

		expect(row.created_at_type).toBe("integer");
		expect(row.created_at).toBeGreaterThanOrEqual(beforeInsert);
		expect(row.created_at).toBeLessThanOrEqual(afterInsert);

		await down(knex);
		expect(await knex.schema.hasTable("analytics_logs")).toBe(false);
	});
});
