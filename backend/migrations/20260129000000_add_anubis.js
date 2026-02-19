import { migrate as logger } from "../logger.js";

const migrateName = "add_anubis";

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
			table.integer("anubis_enabled").notNull().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] Column 'anubis_enabled' added to 'proxy_host'`);
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
			table.dropColumn("anubis_enabled");
		})
		.then(() => {
			logger.info(`[${migrateName}] Column 'anubis_enabled' dropped from 'proxy_host'`);
		});
};

export { up, down };
