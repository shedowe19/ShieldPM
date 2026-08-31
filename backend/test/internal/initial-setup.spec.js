import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let dataPath;
let knex;
let initialSetup;

const strongToken = (byte) => Buffer.alloc(32, byte).toString("base64url");

beforeAll(async () => {
	dataPath = fs.mkdtempSync(path.join(tmpdir(), "shieldpm-initial-setup-"));
	fs.mkdirSync(path.join(dataPath, "shieldpm"), { recursive: true });
	process.env.DATA_PATH = dataPath;
	vi.resetModules();

	const [{ default: db }, setupModule] = await Promise.all([
		import("../../db.js"),
		import("../../internal/initial-setup.js"),
	]);
	knex = db();
	initialSetup = setupModule;

	await knex.schema.createTable("user", (table) => {
		table.increments("id").primary();
		table.integer("is_deleted").notNullable().defaultTo(0);
	});
	await knex.schema.createTable("initial_setup_claim", (table) => {
		table.integer("id").primary();
		table.string("token_hash", 64).notNullable().unique();
		table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
		table.dateTime("consumed_at").nullable();
		table.integer("claimed_user_id").nullable();
		table.string("claimed_ip", 45).nullable();
	});
});

beforeEach(async () => {
	delete process.env.INITIAL_ADMIN_SETUP_TOKEN;
	delete process.env.INITIAL_ADMIN_SETUP_TOKEN_FILE;
	await knex("initial_setup_claim").delete();
	await knex("user").delete();
	fs.rmSync(initialSetup.getGeneratedTokenPath(), { force: true });
});

afterAll(async () => {
	await knex.destroy();
	fs.rmSync(dataPath, { force: true, recursive: true });
	delete process.env.DATA_PATH;
	delete process.env.INITIAL_ADMIN_SETUP_TOKEN;
	delete process.env.INITIAL_ADMIN_SETUP_TOKEN_FILE;
});

describe("initial administrator ownership token", () => {
	it("generates one 256-bit token in a mode-0600 file and persists only its digest", async () => {
		await initialSetup.ensureInitialSetupOwnership();

		const tokenPath = initialSetup.getGeneratedTokenPath();
		const stats = fs.statSync(tokenPath);
		const token = fs.readFileSync(tokenPath, "utf8").trim();
		const claim = await knex("initial_setup_claim").where({ id: initialSetup.SETUP_CLAIM_ID }).first();

		expect(stats.mode & 0o777).toBe(0o600);
		expect(Buffer.from(token, "base64url")).toHaveLength(32);
		expect(claim.token_hash).not.toBe(token);
	});

	it("fails closed when the configured token changes after the ownership claim is created", async () => {
		process.env.INITIAL_ADMIN_SETUP_TOKEN = strongToken(1);
		await initialSetup.ensureInitialSetupOwnership();
		process.env.INITIAL_ADMIN_SETUP_TOKEN = strongToken(2);

		await expect(initialSetup.ensureInitialSetupOwnership()).rejects.toThrow(
			"does not match the pending ownership claim",
		);
	});

	it("rejects a token file that can be read by group or other users", async () => {
		const tokenFile = path.join(dataPath, "insecure-setup-token");
		fs.writeFileSync(tokenFile, `${strongToken(3)}\n`, { mode: 0o644 });
		process.env.INITIAL_ADMIN_SETUP_TOKEN_FILE = tokenFile;

		await expect(initialSetup.ensureInitialSetupOwnership()).rejects.toThrow(
			"permissions must be 0600 or stricter",
		);
	});

	it("rejects symbolic-link token files without a check/read race", async () => {
		const targetFile = path.join(dataPath, "setup-token-target");
		const tokenFile = path.join(dataPath, "setup-token-link");
		fs.writeFileSync(targetFile, `${strongToken(4)}\n`, { mode: 0o600 });
		fs.symlinkSync(targetFile, tokenFile);
		process.env.INITIAL_ADMIN_SETUP_TOKEN_FILE = tokenFile;

		await expect(initialSetup.ensureInitialSetupOwnership()).rejects.toThrow("must not be a symbolic link");
	});

	it("retires a generated token as soon as an active owner already exists", async () => {
		await initialSetup.ensureInitialSetupOwnership();
		const tokenPath = initialSetup.getGeneratedTokenPath();
		await knex("user").insert({ id: 1, is_deleted: 0 });

		await initialSetup.ensureInitialSetupOwnership();

		expect(fs.existsSync(tokenPath)).toBe(false);
		const claim = await knex("initial_setup_claim").where({ id: initialSetup.SETUP_CLAIM_ID }).first();
		expect(claim.claimed_user_id).toBe(1);
		expect(claim.consumed_at).toBeTruthy();
	});
});
