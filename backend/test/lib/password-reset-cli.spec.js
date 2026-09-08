import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("password recovery through the installed CLI symlink", () => {
	let directory;
	let command;
	let filename;
	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-reset-cli-"));
		fs.mkdirSync(path.join(directory, "shieldpm"));
		filename = path.join(directory, "shieldpm/database.sqlite");
		command = path.join(directory, "password-reset.js");
		fs.symlinkSync(fileURLToPath(new URL("../../password-reset.js", import.meta.url)), command);
	});
	afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
	const run = (...args) =>
		spawnSync(process.execPath, [command, ...args], {
			encoding: "utf8",
			env: { ...process.env, DATA_PATH: directory },
		});

	it("executes recovery and revokes sessions instead of silently returning success", () => {
		const database = new Database(filename);
		try {
			database.exec(`
				CREATE TABLE user (id INTEGER PRIMARY KEY, email TEXT, is_deleted INTEGER);
				CREATE TABLE auth (id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, secret TEXT, is_deleted INTEGER, modified_on TEXT);
				CREATE TABLE auth_sessions (id INTEGER PRIMARY KEY, user_id INTEGER, revoked_at TEXT, revoked_reason TEXT);
				INSERT INTO user VALUES (1, 'owner@example.test', 0);
				INSERT INTO auth VALUES (1, 1, 'password', 'old-password', 0, NULL);
				INSERT INTO auth_sessions VALUES (1, 1, NULL, NULL);
			`);
			const result = run("owner@example.test", "replacement-test-password");
			expect(result.status).toBe(0);
			expect(result.stdout).toContain("refresh sessions revoked");
			expect(
				bcrypt.compareSync(
					"replacement-test-password",
					database.prepare("SELECT secret FROM auth").get().secret,
				),
			).toBe(true);
			expect(database.prepare("SELECT revoked_reason FROM auth_sessions").get().revoked_reason).toBe(
				"password_reset",
			);
		} finally {
			database.close();
		}
	});
	it("reports missing arguments as a failed command", () => {
		const result = run();
		expect(result.status).toBe(1);
		expect(result.stdout).toContain("usage:");
	});
	it("reports an absent database without creating one", () => {
		const result = run("owner@example.test", "replacement-test-password");
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Cannot connect to the SQLite database");
		expect(fs.existsSync(filename)).toBe(false);
	});
});
