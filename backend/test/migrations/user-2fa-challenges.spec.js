import crypto from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { down, up } from "../../migrations/20260831121000_add_user_2fa_challenges.js";

let databaseDirectory;
let knex;

beforeEach(async () => {
	databaseDirectory = fs.mkdtempSync(join(tmpdir(), "shieldpm-2fa-migration-"));
	knex = Knex({
		client: "better-sqlite3",
		connection: { filename: join(databaseDirectory, "database.sqlite") },
		useNullAsDefault: true,
	});
	await knex.schema.createTable("user", (table) => {
		table.increments("id").primary();
		table.string("email").notNullable();
	});
	await knex.schema.createTable("user_2fa", (table) => {
		table.increments("id").primary();
		table.integer("user_id").notNullable().references("id").inTable("user").onDelete("CASCADE");
		table.string("type", 32).notNullable();
		table.text("secret").nullable();
	});
	await knex("user").insert({ id: 1, email: "test@example.com" });
});

afterEach(async () => {
	await knex.destroy();
	fs.rmSync(databaseDirectory, { force: true, recursive: true });
});

describe("user 2FA challenge migration", () => {
	it("backfills passkey hashes and enforces credential/challenge uniqueness", async () => {
		await knex("user_2fa").insert({ id: 1, user_id: 1, type: "passkey", secret: "existing-credential" });
		await up(knex);
		await up(knex);

		const passkey = await knex("user_2fa").where({ id: 1 }).first();
		expect(passkey.credential_id_hash).toBe(
			crypto.createHash("sha256").update("existing-credential", "utf8").digest("hex"),
		);
		expect(await knex.schema.hasTable("user_2fa_challenges")).toBe(true);

		await expect(
			knex("user_2fa").insert({
				user_id: 1,
				type: "passkey",
				secret: "duplicate",
				credential_id_hash: passkey.credential_id_hash,
			}),
		).rejects.toThrow();

		const challenge = {
			user_id: 1,
			challenge_id_hash: "a".repeat(64),
			type: "passkey_authentication",
			purpose: "login",
			session_binding: "b".repeat(64),
			flow_key: "c".repeat(64),
			challenge: "challenge",
			expires_at: new Date(Date.now() + 60_000),
		};
		await knex("user_2fa_challenges").insert(challenge);
		await expect(
			knex("user_2fa_challenges").insert({
				...challenge,
				challenge_id_hash: "d".repeat(64),
			}),
		).rejects.toThrow();
	});

	it("rolls back the challenge table and credential digest column", async () => {
		await up(knex);
		await down(knex);

		expect(await knex.schema.hasTable("user_2fa_challenges")).toBe(false);
		expect(await knex.schema.hasColumn("user_2fa", "credential_id_hash")).toBe(false);
	});

	it("repairs a partially created challenge table", async () => {
		await knex.schema.createTable("user_2fa_challenges", (table) => table.increments("id").primary());
		await up(knex);

		expect(await knex.schema.hasColumn("user_2fa_challenges", "challenge_id_hash")).toBe(true);
		expect(await knex.schema.hasColumn("user_2fa_challenges", "session_binding")).toBe(true);
		expect(await knex.schema.hasColumn("user_2fa_challenges", "expires_at")).toBe(true);
	});

	it("fails with an actionable error when historical credentials are duplicated", async () => {
		await knex("user_2fa").insert([
			{ user_id: 1, type: "passkey", secret: "duplicate-credential" },
			{ user_id: 1, type: "passkey", secret: "duplicate-credential" },
		]);

		await expect(up(knex)).rejects.toThrow("Duplicate passkey or YubiKey credentials exist");
	});
});
