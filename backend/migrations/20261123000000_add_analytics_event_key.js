import { migrate as logger } from "../logger.js";

const migrateName = "add_analytics_event_key";
const tableName = "analytics_logs";
const columnName = "event_key";
const indexName = "analytics_logs_event_key_unique";

const indexExists = async (knex) => {
	const client = knex.client.config.client;

	if (["better-sqlite3", "sqlite3"].includes(client)) {
		const indexes = await knex.raw(`PRAGMA index_list('${tableName}')`);
		return indexes.some((index) => index.name === indexName);
	}

	if (["mysql", "mysql2"].includes(client)) {
		const result = await knex.raw("SHOW INDEX FROM ?? WHERE Key_name = ?", [tableName, indexName]);
		const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
		return Array.isArray(rows) && rows.length > 0;
	}

	if (client === "pg") {
		const result = await knex.raw(
			"SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ? AND indexname = ?",
			[tableName, indexName],
		);
		return result.rows.length > 0;
	}

	return true;
};

export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	if (!(await knex.schema.hasTable(tableName))) {
		logger.warn(`[${migrateName}] ${tableName} does not exist; skipping.`);
		return;
	}

	if (!(await knex.schema.hasColumn(tableName, columnName))) {
		await knex.schema.alterTable(tableName, (table) => {
			// Legacy rows stay NULL: SQLite, MySQL and PostgreSQL permit multiple NULLs in a unique index.
			table.string(columnName, 64).nullable();
		});
	}

	if (!(await indexExists(knex))) {
		await knex.schema.alterTable(tableName, (table) => {
			table.unique([columnName], indexName);
		});
	}

	logger.info(`[${migrateName}] Added the idempotency key for analytics detail rows.`);
};

export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	if (!(await knex.schema.hasTable(tableName))) {
		return;
	}

	if (await indexExists(knex)) {
		await knex.schema.alterTable(tableName, (table) => {
			table.dropUnique([columnName], indexName);
		});
	}

	if (await knex.schema.hasColumn(tableName, columnName)) {
		await knex.schema.alterTable(tableName, (table) => {
			table.dropColumn(columnName);
		});
	}
};
