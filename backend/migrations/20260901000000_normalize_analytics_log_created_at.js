import { migrate as logger } from "../logger.js";

const migrateName = "normalize_analytics_log_created_at";
const tableName = "analytics_logs";
const createdAtColumn = "created_at";
const legacyDefaultEarliest = "2025-12-01 00:00:00";

const isSqlite = (knex) => ["better-sqlite3", "sqlite3"].includes(knex.client.config.client);

/**
 * Normalize rows written by the historical SQLite CURRENT_TIMESTAMP default.
 * MySQL and PostgreSQL BIGINT columns cannot contain those timestamp strings.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	if (!(await knex.schema.hasTable(tableName)) || !(await knex.schema.hasColumn(tableName, createdAtColumn))) {
		logger.info(`[${migrateName}] ${tableName}.${createdAtColumn} does not exist; skipping.`);
		return;
	}

	if (!isSqlite(knex)) {
		logger.info(`[${migrateName}] No legacy timestamp-text rows are possible for this database; skipping.`);
		return;
	}

	await knex(tableName)
		.whereRaw("typeof(??) = 'text'", [createdAtColumn])
		// CURRENT_TIMESTAMP emitted this exact UTC shape. Requiring a canonical
		// round-trip and the migration's possible lifetime prevents SQLite from
		// treating arbitrary strings as Julian dates or normalizing invalid dates.
		.whereRaw("strftime('%Y-%m-%d %H:%M:%S', ??) = ??", [createdAtColumn, createdAtColumn])
		.where(createdAtColumn, ">=", legacyDefaultEarliest)
		.whereRaw("?? <= CURRENT_TIMESTAMP", [createdAtColumn])
		.update({
			[createdAtColumn]: knex.raw("CAST(strftime('%s', ??) AS INTEGER) * 1000", [createdAtColumn]),
		});
	logger.info(`[${migrateName}] Legacy SQLite analytics timestamps normalized to epoch milliseconds.`);
};

/**
 * The data normalization is intentionally irreversible; restoring timestamp
 * strings would discard type consistency without recovering lost precision.
 *
 * @returns {Promise<void>}
 */
export const down = async () => {};
