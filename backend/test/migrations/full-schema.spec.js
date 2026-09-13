import fs from "node:fs";
import path from "node:path";
import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";
import { backendSourcePath } from "../helpers/source-path.js";

vi.mock("../../internal/nginx.js", () => ({
	default: {
		deleteConfig: vi.fn().mockResolvedValue(true),
		generateConfig: vi.fn().mockResolvedValue(true),
		test: vi.fn().mockResolvedValue(true),
		reload: vi.fn().mockResolvedValue(true),
	},
}));
vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

describe("complete database migration chain", () => {
	it.each(["sqlite", "postgres"])(
		"builds a fresh %s schema in one transaction",
		async (engine) => {
			const embedded = engine === "postgres" ? await createPostgres() : null;
			const database =
				embedded?.database ||
				knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
			try {
				await database.transaction(async (transaction) => {
					const directory = backendSourcePath("migrations");
					for (const file of fs
						.readdirSync(directory)
						.filter((name) => name.endsWith(".js"))
						.sort()) {
						const migration = await import(path.join(directory, file));
						await migration.up(transaction);
					}
				});
				expect(await database.schema.hasTable("user_2fa")).toBe(true);
				expect(await database.schema.hasColumn("proxy_host", "adv_limit_req_burst")).toBe(true);
				expect(await database.schema.hasColumn("auth_sessions", "replaced_by_session_id")).toBe(true);
				const meta = (await database("setting").where("id", "ai-config").first()).meta;
				expect((typeof meta === "string" ? JSON.parse(meta) : meta).num_ctx).toBe(8192);
			} finally {
				if (embedded) await embedded.close();
				else await database.destroy();
			}
		},
		30000,
	);
});
