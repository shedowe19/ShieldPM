import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import knex from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../migrate.js";
import { backendSourcePath } from "../helpers/source-path.js";

const shouldRunMariaDb = process.env.SHIELDPM_TEST_MARIADB === "1";
const databases = [];
const temporaryDirectories = [];
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
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { force: true, recursive: true });
	}
});

const createMigrationDirectory = () => {
	const root = fs.mkdtempSync(join(tmpdir(), "shieldpm-mariadb-full-migrations-"));
	const directory = join(root, "migrations");
	temporaryDirectories.push(root);
	fs.mkdirSync(directory);
	fs.mkdirSync(join(root, "internal"));
	fs.symlinkSync(backendSourcePath("node_modules"), join(root, "node_modules"), "dir");
	fs.writeFileSync(join(root, "logger.js"), "export const migrate = { info() {}, warn() {} };\n");
	fs.writeFileSync(
		join(root, "internal", "nginx.js"),
		"export default { deleteConfig: async () => true, generateConfig: async () => true, reload: async () => true, test: async () => true };\n",
	);
	for (const migrationName of migrationNames) {
		fs.copyFileSync(join(migrationDirectory, migrationName), join(directory, migrationName));
	}
	return directory;
};

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
			const migrationRunDirectory = createMigrationDirectory();

			await runMigrations(database, migrationRunDirectory);

			const appliedMigrations = (await database("migrations").select("name").orderBy("id"))
				.map(({ name }) => name)
				.sort();
			expect(appliedMigrations).toEqual(migrationNames);
			expect(await database.schema.hasTable("proxy_host")).toBe(true);
			expect(await database.schema.hasTable("user_2fa")).toBe(true);
			expect(await database.schema.hasColumn("proxy_host", "adv_limit_req_burst")).toBe(true);
			expect(await database.schema.hasColumn("proxy_host", "zstd_enabled")).toBe(true);
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
			expect(await database.schema.hasColumn("auth_sessions", "replaced_by_session_id")).toBe(true);
			expect(await database("setting").where("id", "ai-config").first()).toBeTruthy();

			await expect(runMigrations(database, migrationRunDirectory)).resolves.toBeTruthy();
			expect(await database("migrations").count({ count: "id" }).first()).toMatchObject({
				count: migrationNames.length,
			});
		} finally {
			await database?.destroy();
			await admin.destroy();
		}
	}, 60_000);
});
