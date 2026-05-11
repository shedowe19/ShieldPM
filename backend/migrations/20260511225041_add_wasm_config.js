import { migrate as logger } from "../logger.js";

const migrateName = "add_wasm_config";

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
			table.text("wasm_config").notNullable().defaultTo("");
		})
		.then(() => {
			logger.info(`[${migrateName}] column 'wasm_config' added to 'proxy_host'`);
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
			table.dropColumn("wasm_config");
		})
		.then(() => {
			logger.info(`[${migrateName}] column 'wasm_config' dropped from 'proxy_host'`);
		});
};

export { up, down };
