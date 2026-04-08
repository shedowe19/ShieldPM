import { migrate as logger } from "../logger.js";

const migrateName = "add_turbo_loader";

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
			table.integer("turbo_loader").notNullable().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] column 'turbo_loader' added to 'proxy_host'`);
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
			table.dropColumn("turbo_loader");
		})
		.then(() => {
			logger.info(`[${migrateName}] column 'turbo_loader' dropped from 'proxy_host'`);
		});
};

export { up, down };
