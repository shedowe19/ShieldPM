import { migrate as logger } from "../logger.js";

const migrateName = "add_core_indexes";
const coreTables = ["proxy_host", "redirection_host", "dead_host", "stream", "certificate", "access_list"];

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up... adding core indexes`);

	for (const tableName of coreTables) {
		await knex.schema.table(tableName, (table) => {
			table.index(["is_deleted", "owner_user_id"], `idx_${tableName}_deleted_owner`);
		});
		logger.info(`[${migrateName}] Added index to ${tableName}`);
	}
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down... dropping core indexes`);

	for (const tableName of coreTables) {
		await knex.schema.table(tableName, (table) => {
			table.dropIndex(["is_deleted", "owner_user_id"], `idx_${tableName}_deleted_owner`);
		});
		logger.info(`[${migrateName}] Dropped index from ${tableName}`);
	}
};

export { up, down };
