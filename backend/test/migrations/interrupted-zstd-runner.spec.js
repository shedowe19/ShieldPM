import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import knex from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../migrate.js";
import { backendSourcePath } from "../helpers/source-path.js";

const migrationName = "20260918000000_add_proxy_host_zstd_compression.js";
const temporaryDirectories = [];

const createMigrationDirectory = () => {
	const directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-interrupted-migration-"));
	temporaryDirectories.push(directory);
	const migrationUrl = pathToFileURL(backendSourcePath("migrations", migrationName)).href;
	fs.writeFileSync(join(directory, migrationName), `export { up, down } from ${JSON.stringify(migrationUrl)};\n`);
	return directory;
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { force: true, recursive: true });
	}
});

describe("interrupted Zstd migration recovery", () => {
	it("registers an existing column through the production Knex migration runner", async () => {
		const database = knex({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
		});
		try {
			await database.schema.createTable("proxy_host", (table) => table.increments("id"));
			await database.schema.alterTable("proxy_host", (table) => {
				table.boolean("zstd_enabled").notNullable().defaultTo(false);
			});

			await runMigrations(database, createMigrationDirectory());

			expect(await database.schema.hasColumn("proxy_host", "zstd_enabled")).toBe(true);
			expect(await database("migrations").where({ name: migrationName }).first()).toBeTruthy();
			await expect(runMigrations(database, createMigrationDirectory())).resolves.toBeTruthy();
		} finally {
			await database.destroy();
		}
	});
});
