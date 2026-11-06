import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBootstrapApp } from "../../bootstrap-app.js";
import * as databaseConfig from "../../lib/database-config.js";
import {
	createDatabase,
	inspectDatabaseSelection,
	managedConfigPath,
	readManagedDatabase,
	sqlitePath,
	toLegacyDatabase,
	writePrivateJson,
} from "../../lib/database-config.js";
import {
	authorizeOperation,
	cancelDatabaseOperation,
	commitDatabaseOperation,
	executeDatabaseOperation,
	journalPath,
	needsDatabaseSetup,
	publicOperation,
	readOperation,
	requestDatabaseOperation,
} from "../../lib/database-switch.js";

const engine = vi.hoisted(() => ({ migrateDatabase: vi.fn(), verifyDatabase: vi.fn() }));
vi.mock("../../lib/database-copy.js", () => engine);
vi.mock("../../migrate.js", () => ({
	runMigrations: async (database) => {
		if (!(await database.schema.hasTable("user")))
			await database.schema.createTable("user", (table) => table.increments("id"));
	},
}));

let directory;
let server;
beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-db-bootstrap-"));
	vi.stubEnv("DATA_PATH", directory);
	for (const prefix of ["DB_MYSQL", "DB_POSTGRES"])
		for (const key of ["HOST", "USER", "NAME", "PASSWORD", "PORT"]) vi.stubEnv(`${prefix}_${key}`, "");
	engine.migrateDatabase.mockReset();
	engine.verifyDatabase.mockReset().mockResolvedValue({ verified: true });
});
afterEach(async () => {
	if (server) {
		await new Promise((resolve) => server.close(resolve));
		server = null;
	}
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	fs.rmSync(directory, { recursive: true, force: true });
});

const remote = {
	engine: "mysql2",
	host: "127.0.0.1",
	port: 3306,
	user: "fixture",
	password: "private-credential",
	name: "isolated",
};
const initialDatabase = () => {
	fs.mkdirSync(path.dirname(sqlitePath()), { recursive: true });
	const database = new Database(sqlitePath());
	database.exec("CREATE TABLE user (id INTEGER PRIMARY KEY); INSERT INTO user VALUES(1)");
	database.close();
};

describe("database-independent bootstrap and durable activation", () => {
	it("serves real Unix socket health without an IP address or proxy trust assumptions", async () => {
		const socket = path.join(directory, "bootstrap.sock");
		server = createBootstrapApp({ setupRequired: true }).listen(socket);
		await new Promise((resolve) => server.once("listening", resolve));
		const response = await new Promise((resolve, reject) => {
			const request = http.get(
				{ socketPath: socket, path: "/", headers: { "X-Forwarded-For": "192.0.2.1" } },
				(incoming) => {
					let body = "";
					incoming.on("data", (part) => {
						body += part;
					});
					incoming.on("end", () => resolve({ status: incoming.statusCode, body: JSON.parse(body) }));
				},
			);
			request.on("error", reject);
		});
		expect(response).toMatchObject({ status: 200, body: { status: "OK", databaseSetupRequired: true } });
	});
	it("recognizes a new install without creating an application database or key file", async () => {
		expect(await needsDatabaseSetup()).toBe(true);
		expect(fs.existsSync(sqlitePath())).toBe(false);
		expect(fs.existsSync(path.join(directory, "shieldpm/keys.json"))).toBe(false);
	});
	it.each(["managed", "legacy"])(
		"fails closed when the %s explicit SQLite database is missing",
		async (selection) => {
			const filename = path.join(directory, "shieldpm", "database-11111111-1111-4111-8111-111111111111.sqlite");
			if (selection === "managed")
				writePrivateJson(managedConfigPath(), {
					version: 1,
					database: { engine: "sqlite", filename: path.basename(filename) },
				});
			else
				writePrivateJson(path.join(directory, "shieldpm/default.json"), {
					database: { engine: "knex-native", knex: { client: "better-sqlite3", connection: { filename } } },
				});
			await expect(needsDatabaseSetup()).rejects.toThrow();
			expect(fs.existsSync(filename)).toBe(false);
			expect(fs.existsSync(path.join(directory, "shieldpm/keys.json"))).toBe(false);
			expect(fs.existsSync(sqlitePath())).toBe(false);
		},
	);
	it("fails closed when selected managed SQLite is corrupt without replacing it", async () => {
		const filename = "database-11111111-1111-4111-8111-111111111111.sqlite";
		writePrivateJson(managedConfigPath(), { version: 1, database: { engine: "sqlite", filename } });
		const selected = path.join(directory, "shieldpm", filename);
		fs.writeFileSync(selected, "corrupt database payload");
		await expect(needsDatabaseSetup()).rejects.toThrow();
		expect(fs.readFileSync(selected, "utf8")).toBe("corrupt database payload");
		expect(fs.existsSync(path.join(directory, "shieldpm/keys.json"))).toBe(false);
	});
	it.each([[[]], [[{ name: "user" }]]])(
		"refuses managed remote databases missing application schema: %j",
		async (tables) => {
			writePrivateJson(managedConfigPath(), { version: 1, database: remote });
			const connection = { destroy: vi.fn(async () => {}) };
			vi.spyOn(databaseConfig, "createDatabase").mockReturnValue(connection);
			vi.spyOn(databaseConfig, "listDatabaseTables").mockResolvedValue(tables);
			await expect(needsDatabaseSetup()).rejects.toThrow("Managed database schema is missing");
			expect(connection.destroy).toHaveBeenCalledOnce();
			expect(fs.existsSync(path.join(directory, "shieldpm/keys.json"))).toBe(false);
			expect(fs.existsSync(sqlitePath())).toBe(false);
		},
	);
	it("accepts complete managed remote schema and always releases the metadata connection", async () => {
		writePrivateJson(managedConfigPath(), { version: 1, database: remote });
		const connection = { destroy: vi.fn(async () => {}) };
		vi.spyOn(databaseConfig, "createDatabase").mockReturnValue(connection);
		const metadata = vi
			.spyOn(databaseConfig, "listDatabaseTables")
			.mockResolvedValue([{ name: "user" }, { name: "migrations" }]);
		expect(await needsDatabaseSetup()).toBe(false);
		metadata.mockRejectedValue(new Error("unreachable"));
		await expect(needsDatabaseSetup()).rejects.toThrow("unreachable");
		expect(connection.destroy).toHaveBeenCalledTimes(2);
	});
	it("does not create a missing explicit SQLite source even for a pending requested migration", async () => {
		const filename = "database-11111111-1111-4111-8111-111111111111.sqlite";
		writePrivateJson(managedConfigPath(), { version: 1, database: { engine: "sqlite", filename } });
		requestDatabaseOperation(remote);
		await expect(executeDatabaseOperation()).rejects.toThrow("migration failed");
		expect(fs.existsSync(path.join(directory, "shieldpm", filename))).toBe(false);
		expect(engine.migrateDatabase).not.toHaveBeenCalled();
	});
	it("keeps null-manifest managed remote activation in maintenance when its schema vanished", async () => {
		const requested = requestDatabaseOperation(remote, true);
		writePrivateJson(journalPath(), {
			...readOperation(),
			phase: "activating",
			state: "running",
			verification: null,
		});
		writePrivateJson(managedConfigPath(), { version: 1, database: remote, operationId: requested.id });
		const connection = { destroy: vi.fn(async () => {}) };
		vi.spyOn(databaseConfig, "createDatabase").mockReturnValue(connection);
		vi.spyOn(databaseConfig, "listDatabaseTables").mockResolvedValue([]);
		await expect(executeDatabaseOperation()).rejects.toThrow("activation requires verification");
		expect(readOperation().state).toBe("running");
		expect(readOperation().phase).toBe("activating");
		expect(connection.destroy).toHaveBeenCalledOnce();
	});
	it("refuses an emptied managed database while permitting an explicitly configured fresh legacy SQLite file", async () => {
		writePrivateJson(managedConfigPath(), { version: 1, database: { engine: "sqlite" } });
		new Database(sqlitePath()).close();
		await expect(needsDatabaseSetup()).rejects.toThrow("Managed SQLite schema is missing");
		fs.unlinkSync(managedConfigPath());
		writePrivateJson(path.join(directory, "shieldpm/default.json"), {
			database: {
				engine: "knex-native",
				knex: { client: "better-sqlite3", connection: { filename: sqlitePath() } },
			},
		});
		expect(await needsDatabaseSetup()).toBe(false);
		expect(fs.existsSync(path.join(directory, "shieldpm/keys.json"))).toBe(false);
	});
	it("keeps null-manifest activation recovery in maintenance if its managed SQLite schema was emptied", async () => {
		const requested = requestDatabaseOperation({ engine: "sqlite" }, true);
		writePrivateJson(journalPath(), {
			...readOperation(),
			phase: "activating",
			state: "running",
			verification: null,
		});
		writePrivateJson(managedConfigPath(), {
			version: 1,
			database: { engine: "sqlite" },
			operationId: requested.id,
		});
		new Database(sqlitePath()).close();
		await expect(executeDatabaseOperation()).rejects.toThrow("activation requires verification");
		expect(readOperation().phase).toBe("activating");
		expect(readOperation().state).toBe("running");
		expect(fs.existsSync(path.join(directory, "shieldpm/keys.json"))).toBe(false);
	});
	it("does not take over existing SQLite users or custom settings", async () => {
		initialDatabase();
		expect(await needsDatabaseSetup()).toBe(false);
		const database = new Database(sqlitePath());
		database.exec(
			"DELETE FROM user; CREATE TABLE setting(id TEXT PRIMARY KEY,value TEXT); INSERT INTO setting VALUES('custom','retained')",
		);
		database.close();
		expect(await needsDatabaseSetup()).toBe(false);
	});
	it("lets a genuinely empty pre-created SQLite database choose a remote provider without copying an absent schema", async () => {
		fs.mkdirSync(path.dirname(sqlitePath()), { recursive: true });
		const empty = new Database(sqlitePath());
		empty.close();
		expect(await needsDatabaseSetup()).toBe(true);
		requestDatabaseOperation(remote, true);
		expect(readOperation().source).toBeNull();
	});
	it("preserves file before environment before default precedence, and refuses malformed/incomplete explicit config", async () => {
		vi.stubEnv("DB_MYSQL_HOST", "remote.invalid");
		vi.stubEnv("DB_MYSQL_USER", "fixture");
		vi.stubEnv("DB_MYSQL_NAME", "fixture");
		expect(inspectDatabaseSelection().source).toBe("environment");
		expect(await needsDatabaseSetup()).toBe(false);
		writePrivateJson(path.join(directory, "shieldpm/default.json"), {
			database: { engine: "pg", host: "file.invalid" },
		});
		expect(inspectDatabaseSelection().database.engine).toBe("pg");
		fs.writeFileSync(path.join(directory, "shieldpm/default.json"), "{");
		await expect(needsDatabaseSetup()).rejects.toThrow();
		fs.writeFileSync(path.join(directory, "shieldpm/default.json"), "null");
		await expect(needsDatabaseSetup()).rejects.toThrow();
	});
	it("rejects partial remote environment instead of creating a fresh SQLite installation", async () => {
		vi.stubEnv("DB_POSTGRES_HOST", "unreachable.invalid");
		await expect(needsDatabaseSetup()).rejects.toThrow("Incomplete");
		expect(fs.existsSync(sqlitePath())).toBe(false);
	});
	it("publishes only private complete configuration and preserves prior contents on failed rename", () => {
		writePrivateJson(managedConfigPath(), { version: 1, database: remote });
		expect(fs.statSync(managedConfigPath()).mode & 0o777).toBe(0o600);
		vi.spyOn(fs, "renameSync").mockImplementation(() => {
			throw new Error("disk full");
		});
		expect(() => writePrivateJson(managedConfigPath(), { changed: true })).toThrow();
		expect(readManagedDatabase().database.password).toBe("private-credential");
		expect(fs.readdirSync(path.dirname(managedConfigPath()))).toEqual(["database.json"]);
	});
	it("preserves strict TLS when translating a managed connection for the normal application", () => {
		expect(toLegacyDatabase({ ...remote, ssl: true }).ssl).toEqual({
			rejectUnauthorized: true,
			verifyIdentity: true,
		});
	});
	it("permits acknowledging only failed preactivation operations", () => {
		initialDatabase();
		const requested = requestDatabaseOperation(remote);
		expect(() => cancelDatabaseOperation(requested.id, requested.operationToken)).toThrow();
		writePrivateJson(journalPath(), { ...readOperation(), state: "failed", phase: "copying" });
		expect(publicOperation(readOperation()).canCancel).toBe(true);
		expect(() => cancelDatabaseOperation(requested.id, "wrong-token")).toThrow();
		expect(cancelDatabaseOperation(requested.id, requested.operationToken)).toBe("switch");
		expect(readOperation().state).toBe("cancelled");
		writePrivateJson(journalPath(), { ...readOperation(), state: "failed", phase: "activated" });
		expect(publicOperation(readOperation()).canCancel).toBe(false);
		expect(() => cancelDatabaseOperation(requested.id, requested.operationToken)).toThrow();
	});
	it("quarantines a partially initialized first SQLite target and retries into a fresh file", () => {
		const requested = requestDatabaseOperation({ engine: "sqlite" }, true);
		initialDatabase();
		writePrivateJson(journalPath(), { ...readOperation(), state: "failed", phase: "preparing" });
		cancelDatabaseOperation(requested.id, requested.operationToken);
		requestDatabaseOperation({ engine: "sqlite" }, true);
		expect(readOperation().source).toBeNull();
		expect(readOperation().target.filename).toBe(`database-${readOperation().id}.sqlite`);
	});
	it("starts SQLite setup and pins activation before any normal runtime writes", async () => {
		const requested = requestDatabaseOperation({ engine: "sqlite" }, true);
		expect(authorizeOperation(readOperation(), requested.id, requested.operationToken)).toBe(true);
		expect(JSON.stringify(publicOperation(readOperation()))).not.toContain(requested.operationToken);
		await executeDatabaseOperation();
		expect(readOperation().phase).toBe("activated");
		expect(readManagedDatabase().database.engine).toBe("sqlite");
		commitDatabaseOperation();
		expect(readOperation().state).toBe("completed");
		expect(engine.migrateDatabase).not.toHaveBeenCalled();
	});
	it("always chooses a fresh SQLite target when migrating back, preserving archived source", () => {
		initialDatabase();
		writePrivateJson(managedConfigPath(), { version: 1, database: remote });
		requestDatabaseOperation({ engine: "sqlite" });
		const operation = readOperation();
		expect(operation.target.filename).toBe(`database-${operation.id}.sqlite`);
		const target = createDatabase(operation.target);
		expect(target.client.config.connection.filename).not.toBe(sqlitePath());
		return target.destroy();
	});
	it("refuses interrupted preactivation copies without changing original selection", async () => {
		initialDatabase();
		requestDatabaseOperation(remote);
		writePrivateJson(journalPath(), { ...readOperation(), phase: "copying", state: "running" });
		await expect(executeDatabaseOperation()).rejects.toThrow("migration failed");
		expect(readOperation().state).toBe("failed");
		expect(readManagedDatabase()).toBeNull();
		expect(engine.migrateDatabase).not.toHaveBeenCalled();
	});
	it("keeps ambiguous activation in maintenance and never automatically selects the stale source", async () => {
		const requested = requestDatabaseOperation({ engine: "sqlite" }, true);
		writePrivateJson(journalPath(), {
			...readOperation(),
			phase: "activating",
			state: "running",
			verification: { tables: [] },
		});
		writePrivateJson(managedConfigPath(), {
			version: 1,
			database: { engine: "sqlite" },
			operationId: requested.id,
		});
		engine.verifyDatabase.mockRejectedValue(new Error("digest mismatch"));
		await expect(executeDatabaseOperation()).rejects.toThrow("activation requires verification");
		expect(readOperation().state).toBe("running");
		expect(readOperation().phase).toBe("activating");
		expect(readManagedDatabase().operationId).toBe(requested.id);
	});
	it("verifies recovered activation before allowing startup and does not reverify completed databases after new writes", async () => {
		initialDatabase();
		const database = new Database(sqlitePath());
		database.exec("CREATE TABLE migrations(id INTEGER PRIMARY KEY)");
		database.close();
		const requested = requestDatabaseOperation({ engine: "sqlite" }, true);
		const verification = { verified: true, tables: [] };
		writePrivateJson(journalPath(), { ...readOperation(), phase: "activating", state: "running", verification });
		writePrivateJson(managedConfigPath(), {
			version: 1,
			database: { engine: "sqlite" },
			operationId: requested.id,
		});
		await executeDatabaseOperation();
		expect(engine.verifyDatabase).toHaveBeenCalledTimes(1);
		commitDatabaseOperation();
		await executeDatabaseOperation();
		expect(engine.verifyDatabase).toHaveBeenCalledTimes(1);
	});
	it("protects bootstrap setup with CSRF, validates secret payloads safely and protects operation status with a header capability", async () => {
		const started = vi.fn();
		server = createBootstrapApp({ setupRequired: true, onSetup: started }).listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		const origin = `http://127.0.0.1:${server.address().port}`;
		const healthResponse = await fetch(origin);
		const health = await healthResponse.json();
		expect(health.databaseSetupRequired).toBe(true);
		const cookie = healthResponse.headers.get("set-cookie").split(";")[0];
		expect(
			(
				await fetch(`${origin}/database/setup`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ engine: "sqlite" }),
				})
			).status,
		).toBe(403);
		const headers = { "Content-Type": "application/json", "X-XSRF-TOKEN": health.csrfToken, Cookie: cookie };
		const invalid = await fetch(`${origin}/database/setup`, {
			method: "POST",
			headers,
			body: JSON.stringify({ ...remote, leaked: "private-credential" }),
		});
		expect(invalid.status).toBe(400);
		expect(await invalid.text()).not.toContain("private-credential");
		const response = await fetch(`${origin}/database/setup`, {
			method: "POST",
			headers,
			body: JSON.stringify({ engine: "sqlite" }),
		});
		expect(response.status).toBe(202);
		const operation = await response.json();
		expect(started).toHaveBeenCalledTimes(1);
		expect((await fetch(`${origin}/database/operation?id=${operation.id}`)).status).toBe(403);
		expect(
			(
				await fetch(`${origin}/database/operation?id=${operation.id}`, {
					headers: { "X-Database-Operation-Token": operation.operationToken },
				})
			).status,
		).toBe(200);
	});
});
