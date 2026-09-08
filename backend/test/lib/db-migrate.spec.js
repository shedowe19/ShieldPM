import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Knex from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ destination: null, migrateUp: vi.fn(), isSqlite: vi.fn(() => false) }));
vi.mock("../../db.js", () => ({ default: () => state.destination }));
vi.mock("../../migrate.js", () => ({ migrateUp: state.migrateUp }));
vi.mock("../../lib/config.js", () => ({ isSqlite: state.isSqlite }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), error: vi.fn() } }));

import migrateFromSqliteToNewDb, { convertRow, importSqliteDatabase } from "../../lib/db-migrate.js";

let directory;
let source;
let destination;
const createdAt = Date.parse("2026-09-07T12:34:56.000Z");

const connect = (filename) =>
	Knex({
		client: "better-sqlite3",
		connection: { filename },
		useNullAsDefault: true,
		pool: {
			min: 1,
			max: 1,
			afterCreate: (connection, done) => {
				connection.pragma("foreign_keys = ON");
				done(null, connection);
			},
		},
	});

const createSchema = async (knex) => {
	await knex.schema.createTable("migrations", (table) => {
		table.increments("id");
		table.string("name");
	});
	await knex("migrations").insert({ name: "current_schema.js" });
	await knex.schema.createTable("user", (table) => {
		table.increments("id");
		table.string("name");
		table.dateTime("created_on");
	});
	await knex.schema.createTable("setting", (table) => {
		table.string("id").primary();
		table.string("value");
		table.json("meta");
	});
	await knex.schema.createTable("proxy_host", (table) => {
		table.increments("id");
		table.string("name");
	});
	await knex.schema.createTable("access_list", (table) => {
		table.increments("id");
	});
	await knex.schema.createTable("access_list_auth", (table) => {
		table.increments("id");
		table.integer("access_list_id").references("id").inTable("access_list");
		table.string("password");
	});
	await knex.schema.createTable("host_domain", (table) => {
		table.increments("id");
		table.integer("proxy_host_id").references("id").inTable("proxy_host");
		table.string("domain_name");
	});
	for (const tableName of ["user_2fa", "user_2fa_backup_codes", "chat_integration", "future_feature"]) {
		await knex.schema.createTable(tableName, (table) => {
			table.increments("id");
			table.integer("user_id").references("id").inTable("user");
			table.string("value");
		});
	}
	for (const tableName of ["cloudflared_tunnel", "wireguard_peer", "tor_onion", "ddns_provider", "dashboard_note"]) {
		await knex.schema.createTable(tableName, (table) => {
			table.increments("id");
			table.bigInteger("counter");
		});
	}
	await knex.schema.createTable("auth_sessions", (table) => {
		table.increments("id");
		table.integer("user_id").references("id").inTable("user");
		table.integer("parent_session_id").references("id").inTable("auth_sessions");
		table.integer("replaced_by_session_id").references("id").inTable("auth_sessions");
		table.dateTime("created_at");
		table.json("scope");
	});
};

const populateSource = async () => {
	await source("user").insert({ id: 7, name: "Migration user", created_on: createdAt });
	await source("setting").insert({ id: "wireguard", value: "source", meta: '{"enabled":true}' });
	await source("proxy_host").insert({ id: 9, name: "Proxy" });
	await source("access_list").insert({ id: 5 });
	await source("access_list_auth").insert({ id: 1, access_list_id: 5, password: "password-hash" });
	await source("host_domain").insert({ id: 1, proxy_host_id: 9, domain_name: "example.test" });
	for (const tableName of ["user_2fa", "user_2fa_backup_codes", "chat_integration", "future_feature"]) {
		await source(tableName).insert({ id: 1, user_id: 7, value: "preserve-me" });
	}
	for (const tableName of ["cloudflared_tunnel", "wireguard_peer", "tor_onion", "ddns_provider", "dashboard_note"]) {
		await source(tableName).insert({ id: 1, counter: "9007199254740993" });
	}
};

beforeEach(async () => {
	vi.clearAllMocks();
	state.isSqlite.mockReturnValue(false);
	directory = fs.mkdtempSync(join(tmpdir(), "shieldpm-db-import-"));
	fs.mkdirSync(join(directory, "shieldpm"));
	vi.stubEnv("DATA_PATH", directory);
	source = connect(join(directory, "shieldpm", "database.sqlite"));
	destination = connect(join(directory, "destination.sqlite"));
	state.destination = destination;
	await createSchema(source);
	await createSchema(destination);
	await destination("setting").insert([
		{ id: "wireguard", value: "seeded", meta: "{}" },
		{ id: "new-default", value: "retain", meta: "{}" },
	]);
});

afterEach(async () => {
	await source?.destroy();
	await destination?.destroy();
	fs.rmSync(directory, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

describe("SQLite database import", () => {
	it("preserves every application table, normalized domains, auth and bigint values while merging seeded settings", async () => {
		await populateSource();
		await importSqliteDatabase(source, destination);

		const tables = await source("sqlite_master").select("name").where("type", "table");
		for (const { name } of tables) {
			if (name.startsWith("sqlite_") || name === "setting") continue;
			expect(await destination(name).count({ count: "*" }).first()).toEqual(
				await source(name).count({ count: "*" }).first(),
			);
		}
		expect(await destination("setting").where("id", "wireguard").first()).toEqual({
			id: "wireguard",
			value: "source",
			meta: '{"enabled":true}',
		});
		expect(await destination("setting").where("id", "new-default").first()).toMatchObject({ value: "retain" });
		expect(await destination("host_domain").first()).toMatchObject({
			domain_name: "example.test",
			proxy_host_id: 9,
		});
		expect(await destination("user").first()).toMatchObject({ id: 7, created_on: createdAt });
		expect(await destination.raw("SELECT CAST(counter AS TEXT) AS value FROM wireguard_peer")).toEqual([
			{ value: "9007199254740993" },
		]);
		expect(await destination.raw("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
	});

	it("restores cyclic session links across multiple batches with foreign keys enforced", async () => {
		await source("user").insert({ id: 7 });
		const sessions = Array.from({ length: 230 }, (_, index) => ({
			id: index + 1,
			user_id: 7,
			parent_session_id: index === 0 ? null : index,
			replaced_by_session_id: index === 229 ? null : index + 2,
			created_at: createdAt,
			scope: '["user"]',
		}));
		await source("auth_sessions").insert(sessions);
		await importSqliteDatabase(source, destination);
		expect(await destination("auth_sessions").orderBy("id")).toEqual(sessions);
		expect(await destination.raw("PRAGMA foreign_key_check")).toEqual([]);
	});

	it("rolls back every imported row and settings update after an invalid source reference", async () => {
		await populateSource();
		await source.raw("PRAGMA foreign_keys = OFF");
		await source("user_2fa").update({ user_id: 999 });

		await expect(importSqliteDatabase(source, destination)).rejects.toThrow(/FOREIGN KEY constraint/);
		expect(await destination("user")).toEqual([]);
		expect(await destination("host_domain")).toEqual([]);
		expect(await destination("setting").where("id", "wireguard").first()).toMatchObject({ value: "seeded" });
		expect(await source("user_2fa").first()).toMatchObject({ user_id: 999, value: "preserve-me" });
		expect(await destination.raw("PRAGMA foreign_keys")).toEqual([{ foreign_keys: 1 }]);
	});

	it("rejects old schemas instead of silently dropping missing tables", async () => {
		await populateSource();
		await source.schema.dropTable("host_domain");
		await expect(importSqliteDatabase(source, destination)).rejects.toThrow(
			/Start this ShieldPM version with SQLite/,
		);
		expect(await destination("user")).toEqual([]);
	});

	it("rejects pending data migrations even when table names and columns match", async () => {
		await destination("migrations").insert({ name: "new_data_migration.js" });
		await expect(importSqliteDatabase(source, destination)).rejects.toThrow(/schema differs/);
	});

	it("rejects a partially populated destination without overwriting its data", async () => {
		await populateSource();
		await destination("wireguard_peer").insert({ id: 20, counter: 42 });
		await expect(importSqliteDatabase(source, destination)).rejects.toThrow(/wireguard_peer is not empty/);
		expect(await destination("user")).toEqual([]);
		expect(await destination("wireguard_peer")).toEqual([{ id: 20, counter: 42 }]);
	});

	it("uses DATA_PATH and preserves the source database after a successful migration", async () => {
		await source.raw("PRAGMA journal_mode = WAL");
		await populateSource();
		expect(fs.existsSync(join(directory, "shieldpm", "database.sqlite-wal"))).toBe(true);
		await migrateFromSqliteToNewDb();
		expect(state.migrateUp).toHaveBeenCalledOnce();
		expect(fs.existsSync(join(directory, "shieldpm", "database.sqlite"))).toBe(true);
		expect(fs.existsSync(join(directory, "shieldpm", "database.sqlite-wal"))).toBe(true);
		expect(await source("user").first()).toMatchObject({ id: 7 });
		expect(await destination("user").first()).toMatchObject({ id: 7 });
		await migrateFromSqliteToNewDb();
		expect(state.migrateUp).toHaveBeenCalledOnce();
	});

	it("rolls back startup migration errors and keeps the source available for retry", async () => {
		await populateSource();
		await source.raw("PRAGMA foreign_keys = OFF");
		await source("user_2fa").update({ user_id: 999 });
		await expect(migrateFromSqliteToNewDb()).rejects.toThrow(/SQLITE_CONSTRAINT_FOREIGNKEY/);
		expect(fs.existsSync(join(directory, "shieldpm", "database.sqlite"))).toBe(true);
		expect(await destination("user")).toEqual([]);
		await source("user_2fa").update({ user_id: 7 });
		await migrateFromSqliteToNewDb();
		expect(await destination("user_2fa").first()).toMatchObject({ user_id: 7 });
	});
});

describe("SQLite to server database value conversion", () => {
	it("converts PostgreSQL booleans and timestamp milliseconds without losing JSON or large integers", () => {
		const columns = {
			enabled: { type: "boolean" },
			disabled: { type: "boolean" },
			created_on: { type: "timestamp without time zone" },
			meta: { type: "json" },
			counter: { type: "bigint" },
		};
		expect(
			convertRow(
				{ enabled: "1", disabled: "0", created_on: createdAt, meta: '["user"]', counter: "9007199254740993" },
				columns,
			),
		).toEqual({
			enabled: true,
			disabled: false,
			created_on: new Date(createdAt),
			meta: '["user"]',
			counter: "9007199254740993",
		});
		expect(() => convertRow({ enabled: "invalid" }, { enabled: { type: "boolean" } })).toThrow(
			/Invalid SQLite boolean/,
		);
	});
});
