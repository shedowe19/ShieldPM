import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	getEncryptionKey: () => "1".repeat(64),
}));
vi.mock("../../models/token.js", () => ({
	default: () => {
		const payload = { attrs: { id: 7 }, scope: ["user"] };
		return {
			load: async () => payload,
			get: (key) => payload[key],
			hasScope: (scope) => payload.scope.includes(scope),
			getUserId: () => 7,
		};
	},
}));
vi.mock("../../internal/chat.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));

import report from "../../internal/report.js";
import Access from "../../lib/access.js";

describe("host report visibility with real access and database counters", () => {
	beforeAll(async () => {
		await state.database.schema.createTable("user", (table) => {
			table.integer("id").primary();
			table.json("roles");
			table.integer("is_deleted");
			table.integer("is_disabled");
		});
		await state.database.schema.createTable("user_permission", (table) => {
			table.integer("id").primary();
			table.integer("user_id");
			table.string("visibility");
		});
		const tables = ["proxy_host", "redirection_host", "stream", "dead_host"];
		for (const [index, name] of tables.entries()) {
			await state.database.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("owner_user_id");
				table.integer("is_deleted");
			});
			await state
				.database(name)
				.insert([
					...Array.from({ length: index + 1 }, () => ({ owner_user_id: 7, is_deleted: 0 })),
					...Array.from({ length: index + 1 }, () => ({ owner_user_id: 8, is_deleted: 0 })),
					{ owner_user_id: 7, is_deleted: 1 },
					{ owner_user_id: 8, is_deleted: 1 },
				]);
		}
		await state.database("user").insert({ id: 7, roles: "[]", is_deleted: 0, is_disabled: 0 });
		await state.database("user_permission").insert({ id: 1, user_id: 7, visibility: "user" });
	});
	afterAll(async () => state.database.destroy());

	it.each([
		["all", { proxy: 2, redirection: 4, stream: 6, dead: 8 }],
		["user", { proxy: 1, redirection: 2, stream: 3, dead: 4 }],
	])("counts only authorized, nondeleted hosts with visibility=%s", async (visibility, expected) => {
		await state.database("user_permission").where("user_id", 7).update({ visibility });
		const access = new Access("report-test-token-placeholder");
		await access.load();
		const capability = await access.can("reports:hosts", 1);
		expect(capability.permission_visibility).toBe(visibility);
		expect(capability).not.toHaveProperty("visibility");

		expect(await report.getHostsReport(access)).toEqual(expected);
	});
});
