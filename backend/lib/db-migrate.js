import fs from "node:fs";
import Knex from "knex";
import db from "../db.js";
import { global as logger } from "../logger.js";
import { migrateUp } from "../migrate.js"; // Adjust path as needed, index.js imports it from ./migrate.js
import { isSqlite } from "./config.js";
import { resetPostgresSequence } from "./db-sequence.js";

const TABLES = [
	"user",
	"user_permission",
	"auth",
	"setting",
	"certificate",
	"access_list",
	"access_list_client",
	"firewall_policy",
	"proxy_host",
	"redirection_host",
	"dead_host",
	"stream",
	"audit_log",
];

const resetCopiedFirewallPolicySequence = async () =>
	await resetPostgresSequence({ knex: db, tableName: "firewall_policy" });

const migrateFromSqliteToNewDb = async () => {
	// 1. Check if we are NOT using sqlite
	if (isSqlite()) {
		return;
	}

	const sqliteFile = "/data/shieldpm/database.sqlite";

	// 2. Check if sqlite exists
	if (!fs.existsSync(sqliteFile)) {
		return;
	}

	// 3. Check if current DB is empty (check for users table presence or empty migrations)
	try {
		const hasUsersTable = await db().schema.hasTable("user");
		if (hasUsersTable) {
			const userCount = await db()("user").count("id as count").first();
			if (userCount && userCount.count > 0) {
				// DB is not empty, assume it's already set up
				return;
			}
		}
	} catch (_err) {
		// If table doesn't exist, we can proceed
	}

	logger.info("New Database configuration detected with existing SQLite database. Starting migration...");

	// 4. Run migrations on new DB to ensure schema exists
	logger.info("Running migrations on new database...");
	await migrateUp();

	// 5. Open connection to old SQLite DB
	logger.info("Opening connection to old SQLite database...");
	const sqliteKnex = Knex({
		client: "better-sqlite3",
		connection: {
			filename: sqliteFile,
		},
		useNullAsDefault: true,
	});

	try {
		// Disable Foreign Key checks for the import
		// MySQL: SET FOREIGN_KEY_CHECKS = 0;
		// Postgres: SET session_replication_role = 'replica';
		// SQLite: PRAGMA foreign_keys = OFF; (not needed here as we are writing to new db)

		const client = db().client.config.client;
		if (["mysql", "mysql2"].includes(client)) {
			await db().raw("SET FOREIGN_KEY_CHECKS = 0;");
		} else if (["pg", "postgres"].includes(client)) {
			await db().raw("SET session_replication_role = 'replica';");
		}

		for (const table of TABLES) {
			logger.info(`Migrating table: ${table}...`);
			try {
				const rows = await sqliteKnex(table).select("*");
				if (rows.length > 0) {
					// Batch insert to avoid issues with large datasets, though unlikely for this app size
					// Knex .insert works well with arrays
					// We might need to handle boolean conversion if moving to Postgres?
					// Usually knex handles it if the schema is correct.
					// SQLite stores booleans as 0/1. MySQL uses tinyint(1) (0/1). Postgres uses boolean.
					// If the schema in Postgres is boolean, passing 0/1 might fail or might work depending on driver.
					// Let's assume Knex schema defines them as booleans, so we might need casting if issues arise.
					// For now, try direct insert.

					// Special handling for some json fields if they come out as strings from sqlite?
					// access_list.clients, certificate.meta, etc are often JSON strings or objects.
					// Knex usually parses JSON from sqlite.

					await db()(table).insert(rows);
				}
				logger.info(`Migrated ${rows.length} rows for ${table}`);
			} catch (err) {
				if (err.message.includes("no such table")) {
					logger.warn(`Table ${table} does not exist in source SQLite DB, skipping.`);
				} else {
					throw err;
				}
			}
		}

		// Explicit IDs copied from SQLite do not advance PostgreSQL serial sequences.
		// firewall_policy is referenced by proxy_host and is created after this migration.
		await resetCopiedFirewallPolicySequence();

		// Re-enable Foreign Key checks
		if (["mysql", "mysql2"].includes(client)) {
			await db().raw("SET FOREIGN_KEY_CHECKS = 1;");
		} else if (["pg", "postgres"].includes(client)) {
			await db().raw("SET session_replication_role = 'origin';");
		}

		// 6. Rename sqlite file
		logger.info("Migration successful. Renaming old database.sqlite...");
		const backupFile = `${sqliteFile}.migrated`;
		fs.renameSync(sqliteFile, backupFile);
		logger.info(`Renamed ${sqliteFile} to ${backupFile}`);
	} catch (err) {
		logger.error("Migration failed!", err);
		// We do not exit process, maybe we should?
		// If migration failed, we might be in a half-state.
		throw err;
	} finally {
		await sqliteKnex.destroy();
	}
};

export { resetCopiedFirewallPolicySequence, TABLES };
export default migrateFromSqliteToNewDb;
