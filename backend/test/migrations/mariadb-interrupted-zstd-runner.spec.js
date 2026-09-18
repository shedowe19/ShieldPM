import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import knex from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../migrate.js";
import { backendSourcePath } from "../helpers/source-path.js";

const migrationName = "20260918000000_add_proxy_host_zstd_compression.js";
const shouldRunMariaDb = process.env.SHIELDPM_TEST_MARIADB === "1";
const temporaryDirectories = [];
const databases = [];

const connection = {
	host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
	password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
	port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
	user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
};

const createMigrationDirectory = () => {
	const directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-mariadb-migration-"));
	temporaryDirectories.push(directory);
	const migrationUrl = pathToFileURL(backendSourcePath("migrations", migrationName)).href;
	fs.writeFileSync(join(directory, migrationName), `export { up, down } from ${JSON.stringify(migrationUrl)};\n`);
	return directory;
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

const mariaDb = shouldRunMariaDb ? describe : describe.skip;

mariaDb("MariaDB migration recovery", () => {
	it("registers an interrupted Zstd migration without re-adding its existing column", async () => {
		const databaseName = `shieldpm_migration_${randomUUID().replaceAll("-", "")}`;
		databases.push(databaseName);
		const admin = knex({ client: "mysql2", connection });
		let database;
		try {
			await admin.raw("CREATE DATABASE ??", [databaseName]);
			database = knex({ client: "mysql2", connection: { ...connection, database: databaseName } });
			await database.schema.createTable("proxy_host", (table) => table.increments("id"));
			await database.schema.alterTable("proxy_host", (table) => {
				table.boolean("zstd_enabled").notNullable().defaultTo(false);
			});

			await runMigrations(database, createMigrationDirectory());

			expect(await database.schema.hasColumn("proxy_host", "zstd_enabled")).toBe(true);
			expect(await database("migrations").where({ name: migrationName }).first()).toBeTruthy();
			await expect(runMigrations(database, createMigrationDirectory())).resolves.toBeTruthy();
		} finally {
			await database?.destroy();
			await admin.destroy();
		}
	}, 30_000);
});
