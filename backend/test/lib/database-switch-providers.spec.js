import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Knex from "knex";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const digest = (filename) => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const read = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
for (const [provider, client] of [
	["MARIADB", "mysql2"],
	["POSTGRES", "pg"],
]) {
	const suite = process.env[`SHIELDPM_TEST_${provider}`] === "1" ? describe : describe.skip;
	suite(`cold production database switching with ${provider}`, () => {
		it("round-trips the current schema and new writes while preserving the SQLite archive", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-switch-provider-"));
			const directory = path.join(root, "shieldpm");
			fs.mkdirSync(directory, { mode: 0o700 });
			const databaseName = `shieldpm_switch_${crypto.randomUUID().replaceAll("-", "")}`;
			const connection = {
				host: process.env[`SHIELDPM_TEST_${provider}_HOST`] || "127.0.0.1",
				port: Number(process.env[`SHIELDPM_TEST_${provider}_PORT`] || (client === "pg" ? 5432 : 3306)),
				user: process.env[`SHIELDPM_TEST_${provider}_USER`] || (client === "pg" ? "postgres" : "root"),
				password: process.env[`SHIELDPM_TEST_${provider}_PASSWORD`] || "",
			};
			const admin = Knex({
				client,
				connection: { ...connection, database: client === "pg" ? "postgres" : "mysql" },
			});
			const env = { ...process.env, DATA_PATH: root };
			for (const prefix of ["DB_MYSQL", "DB_POSTGRES"])
				for (const key of ["HOST", "PORT", "USER", "PASSWORD", "NAME"]) delete env[`${prefix}_${key}`];
			const run = (operation) => {
				const result = spawnSync(
					process.execPath,
					[backendSourcePath("test", "helpers", "database-switch-provider-child.mjs"), operation],
					{ env, encoding: "utf8", timeout: 30_000 },
				);
				expect(result.status, `isolated ${operation} must succeed`).toBe(0);
			};
			const journal = () => read(path.join(directory, "database-operation.json"));
			const managed = () => read(path.join(directory, "database.json"));
			const request = (target) => {
				fs.writeFileSync(path.join(root, "target.json"), JSON.stringify(target), { mode: 0o600 });
				run("request");
				expect(journal().phase).toBe("requested");
				run("execute");
				expect(journal().phase).toBe("activated");
				for (const filename of [path.join(directory, "database.json"), journal().backupPath])
					expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
				expect(fs.existsSync(path.join(directory, "keys.json"))).toBe(false);
				expect(journal().verification.tables.length).toBeGreaterThan(40);
				run("execute");
				expect(journal().phase).toBe("activated");
				run("commit");
				expect(journal().state).toBe("completed");
			};
			let server;
			let returned;
			try {
				await admin.raw(
					client === "pg" ? `CREATE DATABASE "${databaseName}"` : "CREATE DATABASE ??",
					client === "pg" ? [] : [databaseName],
				);
				run("initialize");
				const archive = path.join(directory, "database.sqlite");
				const originalHash = digest(archive);
				request({
					engine: client,
					host: connection.host,
					port: connection.port,
					user: connection.user,
					password: connection.password,
					name: databaseName,
				});
				expect(managed().database.engine).toBe(client);
				server = Knex({ client, connection: { ...connection, database: databaseName } });
				await server("login_attempts").insert({
					scope: "identity",
					identifier: "after-switch@example.invalid",
					first_attempt_at: 1,
					last_attempt_at: 2,
				});
				await server.destroy();
				server = null;
				request({ engine: "sqlite" });
				expect(managed().database.filename).toMatch(/^database-[0-9a-f-]{36}\.sqlite$/);
				expect(digest(archive)).toBe(originalHash);
				returned = Knex({
					client: "better-sqlite3",
					connection: { filename: path.join(directory, managed().database.filename) },
					useNullAsDefault: true,
				});
				expect(
					await returned("login_attempts").where({ identifier: "after-switch@example.invalid" }).first(),
				).toMatchObject({ id: 7102 });
				expect(await returned("user").where({ id: 7101 }).first()).toMatchObject({ name: "Migration Ω 🧪" });
				expect(await returned("auth_sessions").where({ id: 7101 }).first()).toMatchObject({
					replaced_by_session_id: 7102,
				});
				expect(await returned("auth_sessions").where({ id: 7102 }).first()).toMatchObject({
					parent_session_id: 7101,
				});
				expect(await returned("host_domain_claim_owner").count({ count: "host_id" }).first()).toEqual({
					count: 2,
				});
				expect(
					(await returned.raw("SELECT CAST(sequence AS TEXT) AS exact FROM host_domain_claim_lock"))[0].exact,
				).toBe("9007199254740993");
				expect(JSON.parse((await returned("setting").where({ id: "migration-fixture" }).first()).meta)).toEqual(
					{ nil: null, nested: [true, "Ω 🧪"] },
				);
			} finally {
				await server?.destroy();
				await returned?.destroy();
				try {
					await admin.raw(
						client === "pg" ? `DROP DATABASE IF EXISTS "${databaseName}"` : "DROP DATABASE IF EXISTS ??",
						client === "pg" ? [] : [databaseName],
					);
				} finally {
					await admin.destroy();
					fs.rmSync(root, { recursive: true, force: true });
				}
			}
		}, 120_000);
	});
}
