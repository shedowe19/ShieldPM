#!/usr/bin/env node

// based on: https://github.com/jlesage/docker-nginx-proxy-manager/blob/796734a3f9a87e0b1561b47fd418f82216359634/rootfs/opt/nginx-proxy-manager/bin/reset-password

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

function usage() {
	process.stdout.write(`usage: node ${process.argv[1]} USER_EMAIL PASSWORD

Reset password of a ShieldPM user.

Arguments:
  USER_EMAIL      Email address of the user to reset the password.
  PASSWORD        Required new password of the user.\n`);
	process.exit(1);
}

/** Reset only live password credentials and revoke refresh sessions atomically. */
export async function resetPassword(filename, email, password) {
	if (!email || !password || Buffer.byteLength(password, "utf8") > 72) {
		throw new Error("Email and a password of at most 72 UTF-8 bytes are required");
	}
	if (!fs.existsSync(filename)) throw new Error("Cannot connect to the SQLite database");
	const hash = await bcrypt.hash(password, 13);
	const database = new Database(filename, { fileMustExist: true });
	try {
		return database.transaction(() => {
			const user = database.prepare("SELECT id FROM user WHERE email = ? AND is_deleted = 0").get(email);
			if (!user) throw new Error("No active user with this email");
			const result = database
				.prepare(
					"UPDATE auth SET secret = ?, modified_on = datetime('now', 'localtime') WHERE user_id = ? AND type = 'password' AND is_deleted = 0",
				)
				.run(hash, user.id);
			if (!result.changes) throw new Error("No active password credential for this user");
			if (
				database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_sessions'").get()
			) {
				database
					.prepare(
						"UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'password_reset' WHERE user_id = ? AND revoked_at IS NULL",
					)
					.run(new Date().toISOString(), user.id);
			}
			return result.changes;
		})();
	} finally {
		database.close();
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [email, password] = process.argv.slice(2);
	if (!email || !password) usage();
	try {
		await resetPassword(
			path.join(process.env.DATA_PATH || "/data", "shieldpm", "database.sqlite"),
			email,
			password,
		);
		process.stdout.write(`Password for user ${email} has been reset; refresh sessions revoked.\n`);
	} catch (error) {
		console.error(error.code ? `Password reset failed (${error.code}).` : error.message);
		process.exitCode = 1;
	}
}
