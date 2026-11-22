import knex from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20261123120000_audit_log_request_context.js";

const legacyTable = (database) =>
	database.schema.createTable("audit_log", (table) => {
		table.increments().primary();
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();
		table.integer("user_id").notNullable().unsigned();
		table.string("object_type").notNullable().defaultTo("");
		table.integer("object_id").notNullable().unsigned().defaultTo(0);
		table.string("action").notNullable();
		table.json("meta").notNullable();
	});

let database;

beforeEach(async () => {
	database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	await legacyTable(database);
});

afterEach(async () => database.destroy());

describe("audit log request context migration", () => {
	it("adds nullable correlation columns without destroying existing entries", async () => {
		await database("audit_log").insert({
			created_on: "2026-01-01 10:00:00",
			modified_on: "2026-01-01 10:00:00",
			user_id: 7,
			object_type: "proxy-host",
			object_id: 3,
			action: "updated",
			meta: JSON.stringify({ name: "Legacy" }),
		});

		await up(database);

		for (const column of [
			"ip",
			"user_agent",
			"session_id",
			"request_id",
			"outcome",
			"actor_user_id",
			"actor_type",
			"jti",
		]) {
			expect(await database.schema.hasColumn("audit_log", column)).toBe(true);
		}

		const [legacy] = await database("audit_log");
		expect(legacy).toMatchObject({ user_id: 7, object_type: "proxy-host", object_id: 3, action: "updated" });
		expect(legacy.ip).toBeNull();
		expect(legacy.request_id).toBeNull();
		expect(legacy.outcome).toBeNull();

		// New rows may omit the context fields entirely (nullable, backward compatible).
		await database("audit_log").insert({
			created_on: "2026-01-02 10:00:00",
			modified_on: "2026-01-02 10:00:00",
			user_id: 7,
			object_type: "proxy-host",
			object_id: 4,
			action: "updated",
			meta: "{}",
		});
		await database("audit_log").insert({
			created_on: "2026-01-03 10:00:00",
			modified_on: "2026-01-03 10:00:00",
			user_id: 7,
			object_type: "auth-session",
			object_id: 5,
			action: "refresh_replay_detected",
			meta: "{}",
			ip: "198.51.100.7",
			user_agent: "Test Agent",
			session_id: "family-42",
			request_id: "req-abc-12345",
			outcome: "denied",
			actor_user_id: 1,
			actor_type: "impersonated",
			jti: "jti-abc",
		});

		const indexes = await database.raw("PRAGMA index_list('audit_log')");
		const names = indexes.map((index) => index.name);
		expect(names).toContain("idx_audit_log_created_on");
		expect(names).toContain("idx_audit_log_request_id");

		const rows = await database("audit_log").orderBy("id");
		expect(rows).toHaveLength(3);
		expect(rows[2]).toMatchObject({
			ip: "198.51.100.7",
			session_id: "family-42",
			request_id: "req-abc-12345",
			outcome: "denied",
			actor_user_id: 1,
			actor_type: "impersonated",
			jti: "jti-abc",
		});
	});

	it("can roll back the new columns without deleting entries", async () => {
		await database("audit_log").insert({
			created_on: "2026-01-01 10:00:00",
			modified_on: "2026-01-01 10:00:00",
			user_id: 7,
			object_type: "proxy-host",
			object_id: 3,
			action: "updated",
			meta: "{}",
		});
		await up(database);
		await down(database);

		expect(await database.schema.hasColumn("audit_log", "request_id")).toBe(false);
		expect(await database.schema.hasColumn("audit_log", "outcome")).toBe(false);
		const rows = await database("audit_log");
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ user_id: 7, action: "updated" });
	});
});
