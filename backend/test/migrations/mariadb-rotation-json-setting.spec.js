import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import knex from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const shouldRunMariaDb = process.env.SHIELDPM_TEST_MARIADB === "1";
const databases = [];
const temporaryDirectories = [];
const connection = {
	host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
	password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
	port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
	user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
};

afterEach(async () => {
	const admin = knex({ client: "mysql2", connection });
	try {
		for (const databaseName of databases.splice(0)) {
			await admin.raw("DROP DATABASE IF EXISTS ??", [databaseName]);
		}
	} finally {
		await admin.destroy();
	}
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

const mariaDb = shouldRunMariaDb ? describe : describe.skip;

mariaDb("encryption rotation on MariaDB JSON settings", () => {
	it("writes a JSON column returned as an object back as a valid JSON string", async () => {
		const databaseName = `shieldpm_rotation_${randomUUID().replaceAll("-", "")}`;
		databases.push(databaseName);
		const admin = knex({ client: "mysql2", connection });
		const database = knex({ client: "mysql2", connection: { ...connection, database: databaseName } });
		const dataPath = fs.mkdtempSync(join(tmpdir(), "shieldpm-rotation-json-"));
		temporaryDirectories.push(dataPath);
		fs.mkdirSync(join(dataPath, "shieldpm"), { recursive: true });
		fs.writeFileSync(
			join(dataPath, "shieldpm", "keys.json"),
			JSON.stringify({ key: "unused", pub: "unused", encryptionKey: "02".repeat(32) }),
			{ mode: 0o600 },
		);

		try {
			await admin.raw("CREATE DATABASE ??", [databaseName]);
			await database.schema.createTable("setting", (table) => {
				table.string("id", 255).primary();
				table.string("name", 100).notNullable().defaultTo("");
				table.string("description", 255).notNullable().defaultTo("");
				table.string("value", 255).notNullable().defaultTo("");
				table.text("meta").notNullable();
			});
			await database.raw("ALTER TABLE setting ADD CONSTRAINT meta_json_valid CHECK (json_valid(meta))");
			await database("setting").insert({
				id: "ai-config",
				meta: JSON.stringify({ clientSecret: "rotation-probe-secret", enabled: true }),
			});

			const result = spawnSync(
				process.execPath,
				[backendSourcePath("scripts", "rotate-encryption-key.js"), "--yes"],
				{
					encoding: "utf8",
					env: {
						...process.env,
						DATA_PATH: dataPath,
						DB_MYSQL_HOST: connection.host,
						DB_MYSQL_PORT: String(connection.port),
						DB_MYSQL_USER: connection.user,
						DB_MYSQL_PASSWORD: connection.password,
						DB_MYSQL_NAME: databaseName,
						SHIELDPM_ENCRYPTION_KEY_PREVIOUS: "01".repeat(32),
					},
					timeout: 30_000,
				},
			);
			expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
			expect(result.stdout).toContain("setting.meta id=ai-config");
			expect(result.stdout).toContain("Rotated 1 value(s)");

			const row = await database("setting").where("id", "ai-config").first();
			const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
			expect(meta.clientSecret).toMatch(/^v2:/);
		} finally {
			await database.destroy();
			await admin.destroy();
		}
	}, 30_000);
});
