import { migrate as logger } from "../logger.js";

const migrateName = "add_analytics_ingestion_state";
const tableName = "analytics_ingest_state";

export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	if (await knex.schema.hasTable(tableName)) {
		return;
	}

	await knex.schema.createTable(tableName, (table) => {
		table.increments("id").primary();
		table.string("stream", 64).notNullable().unique();
		table.bigInteger("byte_offset").notNullable().defaultTo(0);
		table.bigInteger("file_size").notNullable().defaultTo(0);
		table.string("file_identity", 128).nullable();
		table.string("head_signature", 64).nullable();
		table.string("last_line_at", 40).nullable();
		table.bigInteger("updated_at").notNullable().defaultTo(0);
	});

	logger.info(`[${migrateName}] Analytics ingestion offset table created.`);
};

export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists(tableName);
};
