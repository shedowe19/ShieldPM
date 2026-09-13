import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetPassword } from "../../password-reset.js";

describe("SQLite password recovery", () => {
	let directory;
	let filename;
	let database;
	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-reset-"));
		filename = path.join(directory, "database.sqlite");
		database = new Database(filename);
		database.exec(`
			CREATE TABLE user (id INTEGER PRIMARY KEY, email TEXT, is_deleted INTEGER);
			CREATE TABLE auth (id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, secret TEXT, is_deleted INTEGER, modified_on TEXT);
			CREATE TABLE auth_sessions (id INTEGER PRIMARY KEY, user_id INTEGER, revoked_at TEXT, revoked_reason TEXT);
			INSERT INTO user VALUES (1,'owner@example.test',0),(2,'other@example.test',0),(3,'deleted@example.test',1);
			INSERT INTO auth VALUES (1,1,'password','old-password',0,NULL),(2,1,'oidc','preserved-oidc',0,NULL),(3,1,'password','deleted-password',1,NULL),(4,2,'password','other-password',0,NULL),(5,3,'password','deleted-user-password',0,NULL);
			INSERT INTO auth_sessions VALUES (1,1,NULL,NULL),(2,1,'earlier','logout'),(3,2,NULL,NULL);
		`);
	});
	afterEach(() => {
		database.close();
		fs.rmSync(directory, { recursive: true, force: true });
	});

	it("changes only the live password and revokes only that user's active sessions", async () => {
		expect(await resetPassword(filename, "owner@example.test", "new-test-password")).toBe(1);
		const rows = database.prepare("SELECT * FROM auth ORDER BY id").all();
		expect(await bcrypt.compare("new-test-password", rows[0].secret)).toBe(true);
		expect(rows.slice(1).map((row) => row.secret)).toEqual([
			"preserved-oidc",
			"deleted-password",
			"other-password",
			"deleted-user-password",
		]);
		const sessions = database.prepare("SELECT * FROM auth_sessions ORDER BY id").all();
		expect(sessions[0].revoked_reason).toBe("password_reset");
		expect(sessions[0].revoked_at).toEqual(expect.any(String));
		expect(sessions[1].revoked_at).toBe("earlier");
		expect(sessions[2].revoked_at).toBeNull();
	});

	it("rolls back the password if session revocation fails", async () => {
		database.exec(
			"CREATE TRIGGER reject_revocation BEFORE UPDATE ON auth_sessions BEGIN SELECT RAISE(ABORT, 'blocked'); END;",
		);
		await expect(resetPassword(filename, "owner@example.test", "new-test-password")).rejects.toThrow("blocked");
		expect(database.prepare("SELECT secret FROM auth WHERE id=1").get().secret).toBe("old-password");
	});

	it("rejects deleted users and bcrypt truncation without modifying credentials", async () => {
		await expect(resetPassword(filename, "deleted@example.test", "new-test-password")).rejects.toThrow(
			"No active user",
		);
		await expect(resetPassword(filename, "owner@example.test", "ä".repeat(37))).rejects.toThrow("72 UTF-8 bytes");
		expect(database.prepare("SELECT secret FROM auth WHERE id=5").get().secret).toBe("deleted-user-password");
	});

	it("does not create a missing database file", async () => {
		const missing = path.join(directory, "absent.sqlite");
		await expect(resetPassword(missing, "owner@example.test", "new-test-password")).rejects.toThrow(
			"Cannot connect",
		);
		expect(fs.existsSync(missing)).toBe(false);
	});
});
