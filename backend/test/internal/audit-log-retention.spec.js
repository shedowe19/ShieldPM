import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, isPostgres: () => false }));

import auditLog, { auditRetentionDays, DEFAULT_AUDIT_RETENTION_DAYS } from "../../internal/audit-log.js";

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

beforeAll(async () => {
	await state.database.schema.createTable("audit_log", (table) => {
		table.increments("id");
		table.string("created_on");
	});
});

afterAll(async () => state.database.destroy());

beforeEach(async () => {
	delete process.env.AUDIT_RETENTION_DAYS;
	await state.database("audit_log").delete();
});

describe("audit retention", () => {
	it("defaults to one year and ignores invalid or zero configuration", () => {
		expect(DEFAULT_AUDIT_RETENTION_DAYS).toBe(365);
		expect(auditRetentionDays(undefined)).toBe(365);
		expect(auditRetentionDays("90")).toBe(90);
		expect(auditRetentionDays("0")).toBe(365);
		expect(auditRetentionDays("-5")).toBe(365);
		expect(auditRetentionDays("not-a-number")).toBe(365);
	});

	it("deletes only entries older than the configured retention", async () => {
		process.env.AUDIT_RETENTION_DAYS = "30";
		const recent = daysAgo(1);
		await state
			.database("audit_log")
			.insert([{ created_on: daysAgo(400) }, { created_on: daysAgo(31) }, { created_on: recent }]);

		const deleted = await auditLog.cleanup();

		expect(deleted).toBe(2);
		const remaining = await state.database("audit_log").orderBy("id");
		expect(remaining).toHaveLength(1);
		expect(remaining[0].created_on).toBe(recent);
	});

	it("accepts an explicit retention for scheduled callers", async () => {
		await state.database("audit_log").insert([{ created_on: daysAgo(10) }, { created_on: daysAgo(1) }]);

		expect(await auditLog.cleanup(5)).toBe(1);
		expect(await state.database("audit_log")).toHaveLength(1);
	});
});
