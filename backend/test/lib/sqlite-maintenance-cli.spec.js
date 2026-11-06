import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

let directory;
beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-vacuum-cli-"));
	fs.mkdirSync(path.join(directory, "shieldpm"));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
const run = () =>
	spawnSync(process.execPath, [backendSourcePath("sqlite-vaccum.js")], {
		encoding: "utf8",
		env: { ...process.env, DATA_PATH: directory },
	});

it("vacuums only the selected migrated SQLite file", () => {
	const managed = "database-22222222-2222-4222-8222-222222222222.sqlite";
	fs.writeFileSync(
		path.join(directory, "shieldpm/database.json"),
		JSON.stringify({ version: 1, database: { engine: "sqlite", filename: managed } }),
	);
	for (const name of ["database.sqlite", managed]) {
		const database = new Database(path.join(directory, "shieldpm", name));
		database.exec("CREATE TABLE retained (value TEXT); INSERT INTO retained VALUES ('preserved');");
		database.close();
	}
	const result = run();
	expect(result.status).toBe(0);
	expect(result.stdout).toContain(managed);
	for (const [name, autoVacuum] of [
		["database.sqlite", 0],
		[managed, 1],
	]) {
		const database = new Database(path.join(directory, "shieldpm", name));
		try {
			expect(database.pragma("auto_vacuum", { simple: true })).toBe(autoVacuum);
			expect(database.prepare("SELECT value FROM retained").get().value).toBe("preserved");
		} finally {
			database.close();
		}
	}
	expect(fs.existsSync(path.join(directory, "shieldpm/keys.json"))).toBe(false);
});

it("does not create a missing application database", () => {
	expect(run().status).not.toBe(0);
	expect(fs.existsSync(path.join(directory, "shieldpm/database.sqlite"))).toBe(false);
});

it("refuses a server selection without connecting or creating SQLite", () => {
	fs.writeFileSync(
		path.join(directory, "shieldpm/database.json"),
		JSON.stringify({
			version: 1,
			database: { engine: "mysql2", host: "unused.invalid", user: "unused", name: "unused" },
		}),
	);
	const result = run();
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain("server database is selected");
	expect(fs.existsSync(path.join(directory, "shieldpm/database.sqlite"))).toBe(false);
});
