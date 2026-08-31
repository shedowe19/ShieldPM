#!/usr/bin/env node

// based on: https://github.com/jlesage/docker-nginx-proxy-manager/blob/796734a3f9a87e0b1561b47fd418f82216359634/rootfs/opt/nginx-proxy-manager/bin/reset-password

import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

function usage() {
	process.stdout.write(`usage: node ${process.argv[1]} USER_EMAIL PASSWORD

Reset password of a ShieldPM user.

Arguments:
  USER_EMAIL      Email address of the user to reset the password.
  PASSWORD        New password (12 to 100 characters).\n`);
	process.exit(1);
}

const args = process.argv.slice(2);
const userEmail = args[0]?.trim().toLowerCase();
const password = args[1];

if (!userEmail && !password) {
	console.error("ERROR: User email address must be set.");
	console.error("ERROR: Password must be set.");
	usage();
}

if (!userEmail) {
	console.error("ERROR: User email address must be set.");
	usage();
}

if (!password) {
	console.error("ERROR: Password must be set.");
	usage();
}

if (password.length < 12 || password.length > 100) {
	console.error("ERROR: Password must contain between 12 and 100 characters.");
	usage();
}

async function run() {
	const databasePath = path.join(process.env.DATA_PATH || "/data", "shieldpm", "database.sqlite");
	if (fs.existsSync(databasePath)) {
		try {
			const passwordHash = await bcrypt.hash(password, 13);
			const db = new Database(databasePath);

			try {
				const resetPassword = db.transaction(() => {
					const user = db
						.prepare("SELECT id FROM user WHERE lower(email) = ? AND is_deleted = 0 AND is_disabled = 0")
						.get(userEmail);
					if (!user) return false;

					const timestamp = new Date().toISOString().replace("T", " ").replace("Z", "");
					const result = db
						.prepare(
							"UPDATE auth SET secret = ?, modified_on = ? WHERE user_id = ? AND type = 'password' AND is_deleted = 0",
						)
						.run(passwordHash, timestamp, user.id);
					if (result.changes !== 1) return false;

					const hasSessions = db
						.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'auth_sessions'")
						.get();
					if (hasSessions) {
						db.prepare(
							"UPDATE auth_sessions SET revoked_at = ?, revoked_reason = 'password_reset_cli' WHERE user_id = ? AND revoked_at IS NULL",
						).run(timestamp, user.id);
					}
					return true;
				});

				if (resetPassword()) {
					process.stdout.write(
						`Password for user ${userEmail} has been reset and active sessions were revoked.\n`,
					);
				} else {
					process.stdout.write(`No active password user found with email ${userEmail}.\n`);
				}
			} finally {
				db.close();
			}
		} catch (error) {
			console.error(error);
			process.exit(1);
		}
	} else {
		console.error("ERROR: Cannot connect to the sqlite database.");
		process.exit(1);
	}
}

run();
