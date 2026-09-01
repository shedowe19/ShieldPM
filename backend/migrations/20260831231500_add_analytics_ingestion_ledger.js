import { migrate as logger } from "../logger.js";

const migrateName = "add_analytics_ingestion_ledger";
const tableName = "analytics_ingestion_batch";

/**
 * Add the transaction ledger used to make durable-spool replay idempotent.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	if (await knex.schema.hasTable(tableName)) {
		logger.info(`[${migrateName}] ${tableName} already exists; skipping.`);
		return;
	}

	await knex.schema.createTable(tableName, (table) => {
		table.string("batch_id", 64).primary();
		table.string("payload_hash", 64).notNullable();
		table.string("claim_token", 64).notNullable();
		table.integer("record_count").unsigned().notNullable();
		table.bigInteger("first_sequence").unsigned().notNullable();
		table.bigInteger("last_sequence").unsigned().notNullable();
		table.string("status", 16).notNullable();
		table.string("created_at", 30).notNullable();
		table.string("committed_at", 30).nullable();
		table.index(["status", "last_sequence"], "analytics_ingestion_batch_replay_cleanup_idx");
	});
	logger.info(`[${migrateName}] ${tableName} created.`);
};

/**
 * Remove the analytics ingestion ledger.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists(tableName);
};
