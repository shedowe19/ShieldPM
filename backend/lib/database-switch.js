import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
	createDatabase,
	databaseDirectory,
	engineOf,
	inspectDatabaseSelection,
	listDatabaseTables,
	managedConfigPath,
	normalizeDatabase,
	readManagedDatabase,
	readPrivateJson,
	sqlitePath,
	writePrivateJson,
} from "./database-config.js";

export const journalPath = () => path.join(databaseDirectory(), "database-operation.json");
export const readOperation = () => readPrivateJson(journalPath());
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const publicOperation = (operation) =>
	operation
		? {
				id: operation.id,
				state: operation.state,
				phase: operation.phase,
				canCancel:
					operation.state === "failed" &&
					!["activating", "activated", "completed"].includes(operation.phase) &&
					readManagedDatabase()?.operationId !== operation.id,
				...(operation.progress ? { progress: operation.progress } : {}),
				...(operation.error ? { error: operation.error } : {}),
				...(operation.errorCode ? { errorCode: operation.errorCode } : {}),
			}
		: null;
export const authorizeOperation = (operation, id, token) =>
	!!operation && operation.id === id && typeof token === "string" && digest(token) === operation.tokenHash;
const saveOperation = (operation, changes) => {
	Object.assign(operation, changes, { updatedAt: new Date().toISOString() });
	writePrivateJson(journalPath(), operation);
};

export const databaseStatus = () => {
	const selection = inspectDatabaseSelection();
	const database = selection.database;
	const engine = database ? engineOf(database) : null;
	return {
		engine,
		configured: !!database,
		source: selection.source,
		editable: true,
		supportedTransitions: engine === "sqlite" ? ["mysql2", "pg"] : engine ? ["sqlite"] : ["sqlite", "mysql2", "pg"],
		operation: publicOperation(readOperation()),
		connection:
			database && engine !== "sqlite"
				? {
						host: database.host,
						port: Number(database.port),
						user: database.user,
						name: database.name,
						ssl: !!database.ssl,
						passwordConfigured: !!database.password,
					}
				: null,
	};
};

export const testDatabase = async (input) => {
	const target = normalizeDatabase(input);
	if (target.engine === "sqlite") return { ok: true };
	const connection = createDatabase(target);
	try {
		await connection.raw("SELECT 1");
		if ((await listDatabaseTables(connection)).length) throw new Error("Target database must be empty");
		return { ok: true };
	} catch {
		throw new Error("Cannot use the target database. Check connectivity, credentials, TLS and that it is empty.");
	} finally {
		await connection.destroy();
	}
};

/** Called before application imports; opening existing SQLite here cannot create a new database. */
export const needsDatabaseSetup = async () => {
	const selection = inspectDatabaseSelection();
	if (selection.explicit) {
		if (!selection.database) throw new Error("Existing database configuration is incomplete");
		return false;
	}
	if (!fs.existsSync(sqlitePath())) return true;
	return !sqliteContainsApplicationData();
};

const sqliteContainsApplicationData = () => {
	const source = new Database(sqlitePath(), { readonly: true, fileMustExist: true });
	try {
		const tables = source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
		for (const { name } of tables) {
			if (
				name.startsWith("sqlite_") ||
				["migrations", "migrations_lock", "host_domain_claim_lock"].includes(name)
			)
				continue;
			// Names come from SQLite metadata; quote identifiers rather than interpolating SQL expressions.
			if (source.prepare(`SELECT 1 FROM "${name.replaceAll('"', '""')}" LIMIT 1`).get()) return true;
		}
		return false;
	} finally {
		source.close();
	}
};

/** Persist intent only; copying starts in the next process before any writer is imported. */
export const requestDatabaseOperation = (input, setup = false) => {
	const current = readOperation();
	if (current && !["completed", "failed", "cancelled"].includes(current.state))
		throw new Error("A database operation is already in progress");
	const target = normalizeDatabase(input);
	const selection = inspectDatabaseSelection();
	const failedFreshSetup =
		setup &&
		current?.kind === "setup" &&
		current.source === null &&
		["failed", "cancelled"].includes(current.state);
	const source =
		setup && (!fs.existsSync(sqlitePath()) || failedFreshSetup || !sqliteContainsApplicationData())
			? null
			: selection.database;
	if (!setup && engineOf(source) === target.engine) throw new Error("Choose a different database engine");
	if (!setup && engineOf(source) !== "sqlite" && target.engine !== "sqlite")
		throw new Error("Direct server database migrations are not supported. Migrate via a fresh SQLite database.");
	const id = crypto.randomUUID();
	if (target.engine === "sqlite" && (!setup || (!source && fs.existsSync(sqlitePath()))))
		target.filename = `database-${id}.sqlite`;
	const token = crypto.randomBytes(32).toString("base64url");
	const operation = {
		version: 1,
		id,
		kind: setup ? "setup" : "switch",
		source,
		target,
		tokenHash: digest(token),
		state: "requested",
		phase: "requested",
		createdAt: new Date().toISOString(),
	};
	writePrivateJson(journalPath(), operation);
	return { ...publicOperation(operation), operationToken: token };
};

const activate = (operation, verification) => {
	saveOperation(operation, { state: "running", phase: "verified", verification });
	saveOperation(operation, { phase: "activating" });
	writePrivateJson(managedConfigPath(), { version: 1, database: operation.target, operationId: operation.id });
	saveOperation(operation, { phase: "activated" });
};

/** No application module may be evaluated until this returns successfully. */
export const executeDatabaseOperation = async () => {
	const operation = readOperation();
	if (!operation || ["completed", "cancelled", "failed"].includes(operation.state)) return;
	const { migrateDatabase, verifyDatabase } = await import("./database-copy.js");
	const { runMigrations } = await import("../migrate.js");
	let source;
	let target;
	try {
		if (["activating", "activated"].includes(operation.phase)) {
			const managed = readManagedDatabase();
			if (managed?.operationId !== operation.id) throw new Error("Activation requires recovery");
			target = createDatabase(operation.target);
			if (operation.verification) await verifyDatabase({ database: target, expected: operation.verification });
			saveOperation(operation, { phase: "activated" });
			return;
		}
		if (operation.phase !== "requested")
			throw new Error("Interrupted copy requires recovery with a new empty target");
		saveOperation(operation, { state: "running", phase: "preparing" });
		fs.mkdirSync(databaseDirectory(), { recursive: true, mode: 0o700 });
		const adoptSqlite = operation.kind === "setup" && operation.target.engine === "sqlite" && operation.source;
		target = createDatabase(operation.target);
		target.client.config.shieldpmBootstrapSchema = true;
		if (adoptSqlite) {
			await runMigrations(target);
			activate(operation, null);
			return;
		}
		if ((await listDatabaseTables(target)).length) throw new Error("Target database must be empty");
		await runMigrations(target);
		if (!operation.source) {
			activate(operation, null);
			return;
		}
		source = createDatabase(operation.source);
		const backupPath = path.join(databaseDirectory(), "database-backups", `${operation.id}.ndjson`);
		fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
		saveOperation(operation, { phase: "copying", backupPath });
		await migrateDatabase({
			source,
			target,
			backupPath,
			onProgress: (progress) => saveOperation(operation, { progress }),
			onVerified: (result) => activate(operation, result),
		});
	} catch (error) {
		const uncertain = ["activating", "activated"].includes(operation.phase);
		const controlled = error?.name === "DatabaseCompatibilityError" && /^DB_[A-Z_]+$/.test(error.publicCode);
		saveOperation(operation, {
			state: uncertain ? "running" : "failed",
			error: uncertain
				? "Database activation requires verification. The application remains in maintenance."
				: controlled
					? error.message
					: "Database migration failed. The source is preserved; use a new empty target to retry.",
			errorCode: controlled ? error.publicCode : null,
		});
		throw new Error(operation.error);
	} finally {
		await source?.destroy();
		await target?.destroy();
	}
};

/** Mark before the normal runtime can accept writes; subsequent crashes keep the target authoritative. */
export const commitDatabaseOperation = () => {
	const operation = readOperation();
	if (operation?.phase === "activated")
		saveOperation(operation, { state: "completed", phase: "completed", error: null });
};

/** Acknowledge only a failed operation that never made its target authoritative. */
export const cancelDatabaseOperation = (id, token) => {
	const operation = readOperation();
	if (!authorizeOperation(operation, id, token)) throw new Error("Permission denied");
	if (
		operation.state !== "failed" ||
		["activating", "activated", "completed"].includes(operation.phase) ||
		readManagedDatabase()?.operationId === operation.id
	)
		throw new Error("Activated operations cannot be cancelled");
	saveOperation(operation, { state: "cancelled", phase: "cancelled", error: null });
	return operation.kind;
};
