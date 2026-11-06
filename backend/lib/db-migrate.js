import fs from "node:fs";
import path from "node:path";
import Knex from "knex";
import db from "../db.js";
import { global as logger } from "../logger.js";
import { migrateUp } from "../migrate.js";
import { isSqlite } from "./config.js";

const INTERNAL_TABLES = new Set(["migrations", "migrations_lock", "knex_migrations", "knex_migrations_lock"]);
const isApplicationTable = (name) => !name.startsWith("sqlite_") && !INTERNAL_TABLES.has(name);
const schemaError = () =>
	new Error("SQLite schema differs from the destination. Start this ShieldPM version with SQLite first, then retry.");

const listTables = async (knex) => {
	const client = knex.client.config.client;
	if (["mysql", "mysql2"].includes(client)) {
		return knex("information_schema.tables")
			.select({ name: "table_name", engine: "engine" })
			.where("table_schema", knex.raw("DATABASE()"))
			.where("table_type", "BASE TABLE");
	}
	if (["pg", "postgres", "postgresql"].includes(client)) {
		return knex("information_schema.tables")
			.select({ name: "table_name" })
			.where("table_schema", knex.raw("current_schema()"))
			.where("table_type", "BASE TABLE");
	}
	return knex("sqlite_master").select("name").where("type", "table");
};

/** Convert SQLite values according to the destination's actual column types. */
export const convertRow = (row, columns) =>
	Object.fromEntries(
		Object.entries(row).map(([name, value]) => {
			const type = columns[name].type.toLowerCase();
			if (value === null) return [name, null];
			if (type === "boolean" || type === "bool") {
				if (![0, 1, "0", "1", false, true].includes(value)) {
					throw new Error(`Invalid SQLite boolean in column ${name}`);
				}
				return [name, value === 1 || value === "1" || value === true];
			}
			// better-sqlite3 stores JS Dates as Unix milliseconds; server databases expect timestamps.
			if (/^(datetime|timestamp)/.test(type) && (typeof value === "number" || /^-?\d+$/.test(value))) {
				const timestamp = new Date(Number(value));
				if (!Number.isFinite(timestamp.getTime())) throw new Error(`Invalid SQLite date in column ${name}`);
				return [name, timestamp];
			}
			return [name, value];
		}),
	);

const readSchema = async (source, target) => {
	const sourceTables = (await listTables(source))
		.map(({ name }) => name)
		.filter(isApplicationTable)
		.sort();
	const targetTableInfo = await listTables(target);
	if (
		["mysql", "mysql2"].includes(target.client.config.client) &&
		targetTableInfo.some(({ name, engine }) => isApplicationTable(name) && engine?.toLowerCase() !== "innodb")
	) {
		throw new Error("SQLite import requires transactional InnoDB tables in the destination");
	}
	// Login throttling initializes lazily; an empty target-only table is harmless.
	const emptyTargetLogin =
		!sourceTables.includes("login_attempts") &&
		targetTableInfo.some(({ name }) => name === "login_attempts") &&
		!(await target("login_attempts").first("id"));
	const targetTables = targetTableInfo
		.map(({ name }) => name)
		.filter((name) => isApplicationTable(name) && !(emptyTargetLogin && name === "login_attempts"))
		.sort();
	if (JSON.stringify(sourceTables) !== JSON.stringify(targetTables) || !sourceTables.includes("user")) {
		throw schemaError();
	}
	if (!(await source.schema.hasTable("migrations"))) throw schemaError();
	// Registry identity must not depend on each engine's SQL collation.
	const sourceMigrations = (await source("migrations").select("name")).map(({ name }) => name).sort();
	const targetMigrations = (await target("migrations").select("name")).map(({ name }) => name).sort();
	if (JSON.stringify(sourceMigrations) !== JSON.stringify(targetMigrations)) throw schemaError();

	const tables = new Map();
	for (const name of sourceTables) {
		const sourceColumns = await source.raw("PRAGMA table_info(??)", [name]);
		const columns = await target(name).columnInfo();
		if (
			JSON.stringify(sourceColumns.map((column) => column.name).sort()) !==
			JSON.stringify(Object.keys(columns).sort())
		) {
			throw schemaError();
		}
		const primaryKeys = sourceColumns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk);
		if (!primaryKeys.length) throw new Error(`Cannot safely paginate table ${name}: expected a primary key`);
		const foreignKeys = await source.raw("PRAGMA foreign_key_list(??)", [name]);
		const selfReferences = [...new Set(foreignKeys.filter((key) => key.table === name).map((key) => key.from))];
		if (selfReferences.some((column) => !columns[column].nullable)) {
			throw new Error(`Cannot safely import non-nullable self references in ${name}`);
		}
		tables.set(name, {
			name,
			columns,
			sourceColumns,
			primaryKey: primaryKeys[0].name,
			primaryKeys: primaryKeys.map((column) => column.name),
			selfReferences,
			dependencies: new Set(foreignKeys.filter((key) => key.table !== name).map((key) => key.table)),
		});
	}

	// Keep constraints enabled: parents precede children on the transaction's one connection.
	const ordered = [];
	const visited = new Set();
	while (ordered.length < tables.size) {
		const next = [...tables.values()].find(
			(table) =>
				!visited.has(table.name) && [...table.dependencies].every((dependency) => visited.has(dependency)),
		);
		if (!next) throw new Error("Cannot safely import cyclic or missing foreign key dependencies");
		ordered.push(next);
		visited.add(next.name);
	}
	return ordered;
};

async function* readBatches(source, table) {
	// Bound memory and bind parameters even for wide proxy hosts and large analytics histories.
	const batchSize = Math.max(1, Math.min(200, Math.floor(900 / table.sourceColumns.length)));
	let lastKey;
	let rows;
	do {
		const query = source(table.name)
			.select(
				table.sourceColumns.map((column) =>
					/int/i.test(column.type)
						? source.raw("CAST(?? AS TEXT) AS ??", [column.name, column.name])
						: column.name,
				),
			)
			// Qualify the real column: the SELECT alias casts integer IDs to text for lossless reads.
			.orderBy(table.primaryKeys.map((key) => `${table.name}.${key}`))
			.limit(batchSize);
		if (lastKey)
			query.where((after) => {
				for (let index = 0; index < table.primaryKeys.length; index++) {
					after.orWhere((branch) => {
						for (let previous = 0; previous < index; previous++)
							branch.where(`${table.name}.${table.primaryKeys[previous]}`, lastKey[previous]);
						branch.where(`${table.name}.${table.primaryKeys[index]}`, ">", lastKey[index]);
					});
				}
			});
		rows = await query;
		if (rows.length > 0) {
			if (rows.some((row) => table.primaryKeys.some((key) => row[key] === null)))
				throw new Error(`Cannot paginate nullable primary key in ${table.name}`);
			yield rows;
			lastKey = table.primaryKeys.map((key) => rows.at(-1)[key]);
		}
	} while (rows.length > 0);
}

const resetSequence = async (target, table) => {
	if (!["pg", "postgres", "postgresql"].includes(target.client.config.client)) return;
	for (const primaryKey of table.primaryKeys) {
		const result = await target.raw("SELECT pg_get_serial_sequence(?, ?) AS sequence_name", [
			target.ref(table.name).toString(),
			primaryKey,
		]);
		const sequence = result.rows[0]?.sequence_name;
		if (sequence) {
			await target.raw(
				"SELECT setval(?::regclass, GREATEST(COALESCE(MAX(??), 0), 1), COALESCE(MAX(??), 0) >= 1) FROM ??",
				[sequence, primaryKey, primaryKey, table.name],
			);
		}
	}
};

/** Import a consistent source snapshot atomically; source schema/data are never modified. */
export const importSqliteDatabase = async (sqlite, destination) => {
	// DDL must precede the row-copy transaction: MySQL would otherwise implicitly commit it.
	if ((await sqlite.schema.hasTable("login_attempts")) && !(await destination.schema.hasTable("login_attempts"))) {
		const columns = await sqlite("login_attempts").columnInfo();
		if (
			Object.keys(columns).sort().join() !==
			["id", "scope", "identifier", "attempt_count", "first_attempt_at", "last_attempt_at", "blocked_until"]
				.sort()
				.join()
		)
			throw schemaError();
		await destination.schema.createTable("login_attempts", (table) => {
			table.increments("id").primary();
			table.string("scope", 32).notNullable();
			table.string("identifier", 255).notNullable();
			table.integer("attempt_count").notNullable().defaultTo(0);
			table.bigInteger("first_attempt_at").notNullable();
			table.bigInteger("last_attempt_at").notNullable();
			table.bigInteger("blocked_until").notNullable().defaultTo(0);
			table.unique(["scope", "identifier"]);
			table.index(["last_attempt_at"]);
			table.index(["blocked_until"]);
		});
	}
	return sqlite.transaction(async (source) =>
		destination.transaction(async (target) => {
			const tables = await readSchema(source, target);
			for (const table of tables) {
				if (table.name === "host_domain_claim_lock") {
					const locks = await target(table.name).select("id", "sequence");
					if (
						locks.length === 0 ||
						(locks.length === 1 && String(locks[0].id) === "1" && String(locks[0].sequence) === "0")
					)
						continue;
				}
				if (table.name !== "setting" && (await target(table.name).first(table.primaryKey))) {
					throw new Error(
						`Destination table ${table.name} is not empty; refusing to overwrite existing data`,
					);
				}
			}
			for (const table of tables) {
				let count = 0;
				for await (const batch of readBatches(source, table)) {
					const rows = batch.map((row) => {
						const converted = convertRow(row, table.columns);
						for (const column of table.selfReferences) converted[column] = null;
						return converted;
					});
					if (
						["mysql", "mysql2"].includes(target.client.config.client) &&
						table.primaryKeys.length === 1 &&
						rows.some((row) => row[table.primaryKey] === "0") &&
						/int/i.test(table.columns[table.primaryKey].type)
					) {
						const [modeRows] = await target.raw("SELECT @@SESSION.sql_mode AS sql_mode");
						if (!modeRows[0].sql_mode.split(",").includes("NO_AUTO_VALUE_ON_ZERO")) {
							throw new Error(
								"MySQL requires NO_AUTO_VALUE_ON_ZERO in sql_mode to preserve imported zero IDs",
							);
						}
					}
					const insert = target(table.name).insert(rows);
					// Schema migrations seed settings; source values must win without losing new defaults.
					if (["setting", "host_domain_claim_lock"].includes(table.name))
						insert.onConflict(table.primaryKeys).merge();
					await insert;
					count += rows.length;
				}
				if (table.selfReferences.length > 0) {
					for await (const rows of readBatches(source, table)) {
						for (const row of rows) {
							const references = Object.fromEntries(
								table.selfReferences.map((column) => [column, row[column]]),
							);
							if (Object.values(references).some((value) => value !== null)) {
								await target(table.name)
									.where(Object.fromEntries(table.primaryKeys.map((key) => [key, row[key]])))
									.update(references);
							}
						}
					}
				}
				const imported = await target(table.name).count({ count: "*" }).first();
				if (table.name !== "setting" && Number(imported.count) !== count) {
					throw new Error(`Row count mismatch importing ${table.name}`);
				}
				await resetSequence(target, table);
				logger.info(`Migrated ${count} rows for ${table.name}`);
			}
		}),
	);
};

const migrateFromSqliteToNewDb = async () => {
	if (isSqlite()) return;
	const sqliteFile = path.join(process.env.DATA_PATH || "/data", "shieldpm", "database.sqlite");
	if (!fs.existsSync(sqliteFile)) return;
	const destination = db();
	// An already configured destination is authoritative. Connection errors must propagate.
	if ((await destination.schema.hasTable("user")) && (await destination("user").first("id"))) return;

	logger.info("New database configuration detected with existing SQLite database. Starting migration...");
	await migrateUp();
	const sqlite = Knex({
		client: "better-sqlite3",
		connection: { filename: sqliteFile, options: { readonly: true } },
		useNullAsDefault: true,
		pool: {
			min: 1,
			max: 1,
		},
	});
	try {
		await importSqliteDatabase(sqlite, destination);
		// Keep the original and any WAL sidecars together; renaming only the main file can lose WAL data.
		logger.info("SQLite migration completed. The original SQLite database has been preserved for recovery.");
	} catch (err) {
		logger.error("SQLite migration failed; imported rows were rolled back and the source was preserved.");
		// Driver messages embed INSERT values, including credentials. Only expose the error code at startup.
		if (err.code)
			throw new Error(`SQLite import failed (${err.code}); source preserved and imported rows rolled back`);
		throw err;
	} finally {
		await sqlite.destroy();
	}
};

export default migrateFromSqliteToNewDb;
