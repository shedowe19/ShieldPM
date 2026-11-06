import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Knex from "knex";
import { afterEach, describe, expect, it } from "vitest";
import {
	canonicalDate,
	canonicalDecimal,
	canonicalJson,
	migrateDatabase,
	verifyDatabase,
} from "../../lib/database-copy.js";

const resources = [];
afterEach(async () => {
	for (const close of resources.splice(0).reverse()) await close();
});
const sqlite = () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-database-copy-"));
	const database = Knex({
		client: "better-sqlite3",
		connection: { filename: path.join(root, "database.sqlite") },
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
	resources.push(async () => {
		await database.destroy();
		fs.rmSync(root, { recursive: true, force: true });
	});
	return database;
};
const schema = async (database) => {
	await database.schema.createTable("migrations", (table) => {
		table.increments("id");
		table.string("name");
	});
	await database("migrations").insert([
		{ name: "fixture.js" },
		{ name: "20251231000000_analytics.js" },
		{ name: "20251231000000_analytics_logs.js" },
	]);
	await database.schema.createTable("setting", (table) => {
		table.string("id").primary();
		table.text("value");
	});
	await database("setting").insert({ id: "seed", value: "default" });
	await database.schema.createTable("host_domain_claim_lock", (table) => {
		table.integer("id").primary();
		table.bigInteger("sequence");
	});
	await database("host_domain_claim_lock").insert({ id: 1, sequence: 0 });
	await database.schema.createTable("parent", (table) => {
		table.increments("id");
		table.string("name");
	});
	await database.schema.createTable("sample", (table) => {
		table.integer("owner").unsigned().references("id").inTable("parent");
		table.string("key", 50);
		table.primary(["owner", "key"]);
		table.bigInteger("counter");
		table.json("payload");
		table.dateTime("created", { precision: 6 });
		table.boolean("enabled");
		table.binary("bytes");
	});
	await database.schema.createTable("sessions", (table) => {
		table.increments("id");
		table.integer("next_id").unsigned().references("id").inTable("sessions");
	});
};
const populate = async (database) => {
	await database("parent").insert({ id: 7, name: "München 東京 🔒" });
	await database("host_domain_claim_lock").update({ sequence: "9007199254740993" });
	await database("setting").update({ value: "source-setting" });
	const provider = database.client.config.client;
	for (let batch = 0; batch < 3; batch++)
		await database("sample").insert(
			Array.from({ length: 45 }, (_, index) => ({
				owner: 7,
				key: `batch-${batch}-${index}`,
				counter: "9007199254740993",
				payload: null,
				created: null,
				enabled: provider === "pg" ? false : 0,
				bytes: Buffer.from([0, 255]),
			})),
		);
	await database("parent").insert({ id: 700, name: "deleted high-water marker" });
	await database("parent").where({ id: 700 }).delete();
	if (provider === "pg") await database.raw("SELECT setval(pg_get_serial_sequence('parent','id'),700,true)");
	const json = '{"large":9007199254740993,"null":null,"nested":[true,{"unicode":"東京"}]}';
	for (const [key, payload] of [
		["a", json],
		["b", "null"],
		["c", null],
	]) {
		await database("sample").insert({
			owner: 7,
			key,
			counter: "9007199254740993",
			payload: payload !== null && provider === "pg" ? database.raw("?::json", [payload]) : payload,
			created: provider === "mysql2" ? "2026-11-06 12:34:56.123" : "2026-11-06T12:34:56.123Z",
			enabled: provider === "pg" ? true : 1,
			bytes: Buffer.from([0, 1, 127, 128, 255]),
		});
	}
	await database("sessions").insert([
		{ id: 11, next_id: null },
		{ id: 12, next_id: 11 },
	]);
	await database("sessions").where({ id: 11 }).update({ next_id: 12 });
};

it("canonicalizes large JSON numbers without IEEE-754 or object-order loss", () => {
	expect(canonicalJson('{"b":9007199254740993,"a":null}')).toBe(
		canonicalJson('{ "a":null,"b":900719925474099300e-2 }'),
	);
	expect(canonicalJson("null")).not.toBe(canonicalJson('"null"'));
	expect(() => canonicalJson('{"a":1,"a":2}')).toThrow("Duplicate");
	expect(canonicalDecimal("-0.000")).toBe("0");
});
it("normalizes timezone offsets and microseconds and rejects invalid calendar dates", () => {
	expect(canonicalDate("2026-11-06T12:34:56.123456+05:30")).toBe("2026-11-06T07:04:56.123456Z");
	expect(canonicalDate("2024-02-29T23:59:59.000001-0230")).toBe("2024-03-01T02:29:59.000001Z");
	for (const date of [
		"2025-02-31T00:00:00Z",
		"2025-02-29",
		"2026-13-01",
		"2026-11-06T24:00:00Z",
		"2026-11-06T23:59:60Z",
	])
		expect(() => canonicalDate(date)).toThrow("Invalid calendar");
});
it("explicitly rejects provider pairs outside the supported matrix", async () => {
	const source = sqlite();
	const target = sqlite();
	await expect(migrateDatabase({ source, target })).rejects.toThrow("Supported migrations");
});
it("verifies exact integers and detects altered cells independently", async () => {
	const database = sqlite();
	await schema(database);
	await populate(database);
	// A verification manifest must carry source semantic column kinds, including JSON/SQL-null distinction.
	await expect(verifyDatabase({ database, expected: { tables: [] } })).rejects.toThrow("table set");
});

const selector = process.env.SHIELDPM_TEST_DATABASE_CONNECTIONS;
const integration = selector ? describe : describe.skip;
integration("actual isolated database provider round trips", () => {
	const server = async (provider) => {
		const settings = JSON.parse(fs.readFileSync(selector, "utf8"))[provider];
		const name = `shieldpm_copy_${crypto.randomBytes(10).toString("hex")}`;
		const client = provider === "mariadb" ? "mysql2" : "pg";
		const connection = {
			host: settings.host,
			port: settings.port,
			user: settings.user,
			password: settings.password,
		};
		const admin = Knex({ client, connection: { ...connection, database: client === "pg" ? "postgres" : "mysql" } });
		await admin.raw(
			client === "pg" ? `CREATE DATABASE "${name}"` : "CREATE DATABASE ??",
			client === "pg" ? [] : [name],
		);
		const database = Knex({
			client,
			connection: {
				...connection,
				database: name,
				...(client === "mysql2" ? { dateStrings: true, supportBigNumbers: true, bigNumberStrings: true } : {}),
			},
		});
		resources.push(async () => {
			await database.destroy();
			await admin.raw(
				client === "pg" ? `DROP DATABASE "${name}"` : "DROP DATABASE ??",
				client === "pg" ? [] : [name],
			);
			await admin.destroy();
		});
		return database;
	};
	for (const provider of ["mariadb", "postgres"])
		for (const reverse of [false, true])
			it(`${reverse ? provider : "sqlite"} → ${reverse ? "sqlite" : provider} preserves composite keys, exact bigint, JSON null, binary, unicode, dates and cyclic sessions`, async () => {
				const embedded = sqlite();
				const external = await server(provider);
				const source = reverse ? external : embedded;
				const target = reverse ? embedded : external;
				await schema(source);
				await schema(target);
				await populate(source);
				const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-copy-backup-"));
				resources.push(async () => fs.rmSync(directory, { recursive: true, force: true }));
				const backupPath = path.join(directory, "source.ndjson");
				let activation = false;
				const result = await migrateDatabase({
					source,
					target,
					backupPath,
					onVerified: async (expected) => {
						expect(await verifyDatabase({ database: target, expected })).toBe(true);
						const other = Knex(source.client.config);
						try {
							if (source.client.config.client === "pg") await other.raw("SET lock_timeout = '100ms'");
							else if (source.client.config.client === "mysql2")
								await other.raw("SET SESSION lock_wait_timeout = 1");
							else await other.raw("PRAGMA busy_timeout = 10");
							await expect(
								other("parent").where({ id: 7 }).update({ name: "concurrent writer" }),
							).rejects.toBeDefined();
						} finally {
							await other.destroy();
						}
						activation = true;
					},
				});
				expect(activation).toBe(true);
				expect(result.verified).toBe(true);
				expect(fs.statSync(backupPath).mode & 0o777).toBe(0o600);
				expect(JSON.parse(fs.readFileSync(backupPath, "utf8").trim().split("\n").at(-1)).complete).toBe(true);
				expect(await target("sessions").where({ id: 11 }).first("next_id")).toEqual({ next_id: 12 });
				await target("parent").insert({ name: "next sequence" });
				expect((await target("parent").where({ name: "next sequence" }).first()).id).toBe(701);
				await target("parent").where({ id: 701 }).delete();
				await target("parent").where({ id: 7 }).update({ name: "modified" });
				await expect(verifyDatabase({ database: target, expected: result })).rejects.toThrow(
					"verification failed",
				);
			}, 30000);
	for (const provider of ["mariadb", "postgres"])
		it(`${provider} refuses a nonempty destination atomically`, async () => {
			const source = sqlite();
			const target = await server(provider);
			await schema(source);
			await schema(target);
			await populate(source);
			await target("parent").insert({ id: 99, name: "existing" });
			await expect(migrateDatabase({ source, target })).rejects.toThrow("not empty");
			expect(await target("setting").first("value")).toEqual({ value: "default" });
			expect(String((await target("parent").count({ count: "*" }).first()).count)).toBe("1");
		}, 30000);
	it("rejects fractional timestamps that a zero-precision MariaDB column would truncate before activation", async () => {
		const source = sqlite();
		const target = await server("mariadb");
		await schema(source);
		await schema(target);
		await populate(source);
		await target.raw("ALTER TABLE sample MODIFY created DATETIME NULL");
		let activated = false;
		await expect(
			migrateDatabase({
				source,
				target,
				onVerified: () => {
					activated = true;
				},
			}),
		).rejects.toMatchObject({
			name: "DatabaseCompatibilityError",
			publicCode: "DB_VALUE_INCOMPATIBLE",
			message: expect.stringContaining("sample.created"),
		});
		expect(activated).toBe(false);
		expect(String((await target("parent").count({ count: "*" }).first()).count)).toBe("0");
	}, 30000);
	it("rejects server-to-server migration explicitly", async () => {
		await expect(
			migrateDatabase({ source: await server("mariadb"), target: await server("postgres") }),
		).rejects.toThrow("Supported migrations");
	});
	it("rolls back a MySQL unsigned bigint that SQLite would coerce to an imprecise REAL", async () => {
		const source = await server("mariadb");
		const target = sqlite();
		await schema(source);
		await schema(target);
		await populate(source);
		await source.raw("ALTER TABLE sample MODIFY counter BIGINT UNSIGNED NULL");
		await source("sample").where({ owner: 7, key: "a" }).update({ counter: "18446744073709551615" });
		await expect(migrateDatabase({ source, target })).rejects.toMatchObject({
			name: "DatabaseCompatibilityError",
			publicCode: "DB_VALUE_INCOMPATIBLE",
		});
		expect((await target("parent").count({ count: "*" }).first()).count).toBe(0);
	});
	it("retains a verifiable committed target and durable backup when activation publication fails", async () => {
		const source = sqlite();
		const target = await server("postgres");
		await schema(source);
		await schema(target);
		await populate(source);
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-copy-recovery-"));
		resources.push(async () => fs.rmSync(directory, { recursive: true, force: true }));
		const backupPath = path.join(directory, "source.ndjson");
		let expected;
		await expect(
			migrateDatabase({
				source,
				target,
				backupPath,
				onVerified: (result) => {
					expected = result;
					throw new Error("publication failed");
				},
			}),
		).rejects.toThrow("source preserved");
		expect(await verifyDatabase({ database: target, expected })).toBe(true);
		expect(JSON.parse(fs.readFileSync(backupPath, "utf8").trim().split("\n").at(-1)).complete).toBe(true);
		await expect(source("parent").where({ id: 7 }).update({ name: "source writer resumes" })).resolves.toBe(1);
	});
});
