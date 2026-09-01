import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { up as createAuthSessions } from "../../migrations/20260316122700_add_auth_sessions.js";
import { down, up } from "../../migrations/20260831110000_harden_auth_identity.js";

let databaseDirectory;
let knex;

beforeEach(async () => {
	databaseDirectory = fs.mkdtempSync(join(tmpdir(), "shieldpm-auth-identity-migration-"));
	knex = Knex({
		client: "better-sqlite3",
		connection: { filename: join(databaseDirectory, "database.sqlite") },
		useNullAsDefault: true,
	});
	await knex.schema.createTable("user", (table) => {
		table.increments("id").primary();
		table.string("email").notNullable();
	});
	await knex("user").insert([
		{ id: 1, email: "first@example.test" },
		{ id: 2, email: "second@example.test" },
	]);
	await createAuthSessions(knex);
});

afterEach(async () => {
	await knex.destroy();
	fs.rmSync(databaseDirectory, { force: true, recursive: true });
});

describe("auth and identity hardening migration", () => {
	it("is retry-safe and creates every server-side authentication state table", async () => {
		await up(knex);
		await up(knex);

		for (const table of ["oidc_identity", "oidc_flow", "initial_setup_claim", "login_attempts", "auth_challenge"]) {
			expect(await knex.schema.hasTable(table)).toBe(true);
		}
		for (const column of [
			"auth_time",
			"authentication_methods",
			"actor_user_id",
			"actor_session_id",
			"impersonated_at",
		]) {
			expect(await knex.schema.hasColumn("auth_sessions", column)).toBe(true);
		}
	});

	it("fails closed when the same issuer and subject are bound twice", async () => {
		await up(knex);
		const identity = {
			binding_hash: "a".repeat(64),
			issuer_hash: "b".repeat(64),
			subject_hash: "c".repeat(64),
			issuer: "https://issuer.example.test",
			subject: "stable-subject",
		};
		await knex("oidc_identity").insert({ ...identity, user_id: 1 });

		await expect(
			knex("oidc_identity").insert({
				...identity,
				user_id: 2,
				binding_hash: "d".repeat(64),
			}),
		).rejects.toThrow();
	});

	it("repairs tables left behind by a partially completed migration", async () => {
		for (const tableName of [
			"oidc_identity",
			"oidc_flow",
			"initial_setup_claim",
			"login_attempts",
			"auth_challenge",
		]) {
			await knex.schema.createTable(tableName, (table) => table.increments("id").primary());
		}

		await up(knex);

		expect(await knex.schema.hasColumn("oidc_identity", "binding_hash")).toBe(true);
		expect(await knex.schema.hasColumn("oidc_flow", "pkce_verifier")).toBe(true);
		expect(await knex.schema.hasColumn("initial_setup_claim", "token_hash")).toBe(true);
		expect(await knex.schema.hasColumn("login_attempts", "blocked_until")).toBe(true);
		expect(await knex.schema.hasColumn("auth_challenge", "challenge_hash")).toBe(true);
	});

	it("removes only the hardening schema on rollback", async () => {
		await up(knex);
		await down(knex);

		expect(await knex.schema.hasTable("auth_sessions")).toBe(true);
		expect(await knex.schema.hasTable("oidc_identity")).toBe(false);
		expect(await knex.schema.hasColumn("auth_sessions", "auth_time")).toBe(false);
	});
});
