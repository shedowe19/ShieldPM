import Ajv from "ajv/dist/2020.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, isPostgres: () => false }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));

import auditLog from "../../internal/audit-log.js";
import settings from "../../internal/setting.js";
import { getCompiledSchema } from "../../schema/index.js";

describe("settings events in the published audit response", () => {
	const access = { can: vi.fn().mockResolvedValue(true), token: { getUserId: () => 1 } };
	beforeAll(async () => {
		await state.database.schema.createTable("setting", (table) => {
			table.string("id").primary();
			table.string("name");
			table.string("description");
			table.string("value");
			table.json("meta");
		});
		await state.database.schema.createTable("audit_log", (table) => {
			table.increments("id");
			table.string("created_on");
			table.string("modified_on");
			table.integer("user_id");
			table.integer("object_id");
			table.string("object_type");
			table.string("action");
			table.json("meta");
		});
		await state.database("setting").insert({
			id: "oidc-config",
			name: "OIDC",
			description: "Login provider",
			value: "metadata",
			meta: "{}",
		});
	});
	afterAll(async () => state.database.destroy());

	it("accepts the real event created by updating a setting with a string identifier", async () => {
		await settings.update(access, { id: "oidc-config", meta: { name: "Company login" } });
		const rows = await auditLog.getAll(access);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ object_id: 0, object_type: "setting", meta: { setting_id: "oidc-config" } });
		const schema = await getCompiledSchema();
		const validate = new Ajv({ strict: false }).compile(
			schema.paths["/audit-log"].get.responses[200].content["application/json"].schema,
		);
		expect(validate(JSON.parse(JSON.stringify(rows))), JSON.stringify(validate.errors)).toBe(true);
	});
});
