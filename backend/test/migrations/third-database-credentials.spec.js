import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import knex from "knex";
import { describe, expect, it, vi } from "vitest";
import * as passwords from "../../migrations/20260116000000_hash_access_list_passwords.js";
import * as terminals from "../../migrations/20260123000000_terminal_on_proxy_host.js";
import { createPostgres } from "../helpers/postgres.js";
import { backendSourcePath } from "../helpers/source-path.js";

vi.mock("../../internal/nginx.js", () => ({
	default: {
		deleteConfig: vi.fn().mockResolvedValue(true),
		generateConfig: vi.fn().mockResolvedValue(true),
		test: vi.fn().mockResolvedValue(true),
		reload: vi.fn().mockResolvedValue(true),
	},
}));
vi.mock("../../logger.js", () => ({ migrate: { info: vi.fn(), warn: vi.fn() } }));

const withDatabase = async (engine, run) => {
	const embedded = engine === "postgres" ? await createPostgres() : null;
	const database =
		embedded?.database ||
		knex({
			client: "better-sqlite3",
			connection: { filename: ":memory:" },
			useNullAsDefault: true,
			pool: {
				afterCreate(connection, done) {
					connection.pragma("foreign_keys = ON");
					done(null, connection);
				},
			},
		});
	try {
		await database.transaction(run);
	} finally {
		if (embedded) await embedded.close();
		else await database.destroy();
	}
};

describe("historical credential migration preservation", () => {
	it.each(["sqlite", "postgres"])(
		"hashes plaintext including bcrypt-like prefixes and preserves supported hashes on %s",
		async (engine) => {
			await withDatabase(engine, async (db) => {
				await db.schema.createTable("access_list_auth", (table) => {
					table.increments("id");
					table.string("password");
				});
				const bcryptHash = await bcrypt.hash("existing bcrypt password", 4);
				const apr1Hash = "$apr1$HFwWkZQt$FyDwmtiVtocpLmiLXvj5Z/";
				await db("access_list_auth").insert([
					{ id: 1, password: "$2-this-is-a-plaintext-password" },
					{ id: 2, password: "ordinary plaintext" },
					{ id: 3, password: bcryptHash },
					{ id: 4, password: apr1Hash },
				]);
				await passwords.up(db);
				const rows = await db("access_list_auth").orderBy("id");
				expect(await bcrypt.compare("$2-this-is-a-plaintext-password", rows[0].password)).toBe(true);
				expect(await bcrypt.compare("ordinary plaintext", rows[1].password)).toBe(true);
				expect(bcrypt.getRounds(rows[0].password)).toBe(13);
				expect(rows[2].password).toBe(bcryptHash);
				expect(rows[3].password).toBe(apr1Hash);
				await passwords.up(db);
				expect(await db("access_list_auth").orderBy("id")).toEqual(rows);
			});
		},
		30000,
	);

	it.each([
		["sqlite", 32],
		["postgres", 32],
		["sqlite", 4096],
		["postgres", 4096],
	])(
		"preserves terminal credentials of length %s/%i through up, down and up without duplicate hosts",
		async (engine, keyLength) => {
			await withDatabase(engine, async (db) => {
				const directory = backendSourcePath("migrations");
				for (const file of fs
					.readdirSync(directory)
					.filter((name) => name.endsWith(".js"))
					.sort()) {
					if (file === "20260123000000_terminal_on_proxy_host.js") break;
					await (await import(path.join(directory, file))).up(db);
				}
				const timestamps = { created_on: "2026-01-23 10:00:00", modified_on: "2026-01-23 10:00:00" };
				await db("user").insert({
					...timestamps,
					id: 1,
					email: "owner@example.test",
					name: "Owner",
					nickname: "owner",
					avatar: "",
					roles: "[]",
				});
				await db("proxy_host").insert({
					...timestamps,
					owner_user_id: 1,
					domain_names: '["web.example.test"]',
					forward_host: "web.example.test",
					forward_port: 80,
					meta: "{}",
				});
				await db("terminal_host").insert({
					...timestamps,
					owner_user_id: 1,
					name: "Original SSH host",
					host: "ssh.example.test",
					username: "old-user",
					auth_type: "key",
					private_key: "old-encrypted-key",
					meta: '{"note":"preserve legacy terminal metadata"}',
				});
				const original = await db("terminal_host").first();
				await terminals.up(db);
				const updatedKey = "a".repeat(keyLength);
				await db("proxy_host").where("forward_scheme", "terminal").update({
					terminal_username: "updated-user",
					terminal_private_key: updatedKey,
				});
				await terminals.down(db);
				expect(await db("proxy_host").where("forward_scheme", "terminal")).toEqual([]);
				expect(await db("proxy_host").pluck("forward_host")).toEqual(["web.example.test"]);
				const restored = await db("terminal_host").first();
				expect(restored.created_on).toEqual(original.created_on);
				expect(restored.modified_on).toEqual(original.modified_on);
				expect(restored).toMatchObject({
					name: "Original SSH host",
					username: "updated-user",
					private_key: updatedKey,
				});
				expect(typeof restored.meta === "string" ? JSON.parse(restored.meta) : restored.meta).toEqual({
					note: "preserve legacy terminal metadata",
				});
				await terminals.up(db);
				const terminalRows = await db("proxy_host").where("forward_scheme", "terminal");
				expect(terminalRows).toHaveLength(1);
				expect(terminalRows[0]).toMatchObject({
					created_on: original.created_on,
					modified_on: original.modified_on,
					terminal_username: "updated-user",
					terminal_private_key: updatedKey,
				});
				await db("tor_onion").insert({
					...timestamps,
					owner_user_id: 1,
					proxy_host_id: terminalRows[0].id,
					name: "Existing onion service",
					private_key: "preserve-onion-key",
					meta: "{}",
				});
				await expect(terminals.down(db)).rejects.toThrow("tor_onion references them");
				expect(await db.schema.hasTable("terminal_host")).toBe(false);
				expect(await db("tor_onion").first()).toMatchObject({ private_key: "preserve-onion-key" });
				expect(await db("proxy_host").where("id", terminalRows[0].id).first()).toMatchObject({
					terminal_private_key: updatedKey,
				});
			});
		},
		30000,
	);
});
