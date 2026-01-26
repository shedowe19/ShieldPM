import { migrate as logger } from "../logger.js";

const migrateName = "add_index_file";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("proxy_host", (table) => {
			table.string("index_file").nullable().defaultTo(null);
		})
		.then(() => {
			logger.info(`[${migrateName}] Column 'index_file' added to 'proxy_host'`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.table("proxy_host", (table) => {
			table.dropColumn("index_file");
		})
		.then(() => {
			logger.info(`[${migrateName}] Column 'index_file' dropped from 'proxy_host'`);
		});
};

export { up, down };
