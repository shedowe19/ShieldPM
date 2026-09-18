import { randomUUID } from "node:crypto";
import fs from "node:fs";
import knex from "knex";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../../migrate.js";
import { backendSourcePath } from "../helpers/source-path.js";

vi.mock("../../internal/nginx.js", () => ({
	default: {
		deleteConfig: vi.fn().mockResolvedValue(true),
		generateConfig: vi.fn().mockResolvedValue(true),
		reload: vi.fn().mockResolvedValue(true),
		test: vi.fn().mockResolvedValue(true),
	},
}));
vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

const shouldRunMariaDb = process.env.SHIELDPM_TEST_MARIADB === "1";
const databases = [];
const migrationDirectory = backendSourcePath("migrations");
const migrationNames = fs
	.readdirSync(migrationDirectory)
	.filter((name) => name.endsWith(".js"))
	.sort();
const connection = {
	host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
	password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
	port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
	user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
};

afterEach(async () => {
	for (const databaseName of databases.splice(0)) {
		const admin = knex({ client: "mysql2", connection });
		try {
			await admin.raw("DROP DATABASE IF EXISTS ??", [databaseName]);
		} finally {
			await admin.destroy();
		}
	}
});

const mariaDb = shouldRunMariaDb ? describe : describe.skip;

mariaDb("complete MariaDB migration chain", () => {
	it("applies every migration through the production runner to a fresh database", async () => {
		const databaseName = `shieldpm_full_migration_${randomUUID().replaceAll("-", "")}`;
		databases.push(databaseName);
		const admin = knex({ client: "mysql2", connection });
		let database;
		try {
			await admin.raw("CREATE DATABASE ??", [databaseName]);
			database = knex({ client: "mysql2", connection: { ...connection, database: databaseName } });

			await runMigrations(database);

			const appliedMigrations = (await database("migrations").select("name").orderBy("id"))
				.map(({ name }) => name)
				.sort();
			expect(appliedMigrations).toEqual(migrationNames);
			expect(await database.schema.hasTable("proxy_host")).toBe(true);
			expect(await database.schema.hasTable("user_2fa")).toBe(true);
			expect(await database.schema.hasColumn("proxy_host", "adv_limit_req_burst")).toBe(true);
			expect(await database.schema.hasColumn("proxy_host", "zstd_enabled")).toBe(true);
			expect(await database.schema.hasColumn("auth_sessions", "replaced_by_session_id")).toBe(true);
			expect(await database("setting").where("id", "ai-config").first()).toBeTruthy();

			await expect(runMigrations(database)).resolves.toBeTruthy();
			expect(await database("migrations").count({ count: "id" }).first()).toMatchObject({
				count: migrationNames.length,
			});
		} finally {
			await database?.destroy();
			await admin.destroy();
		}
	}, 60_000);
});
