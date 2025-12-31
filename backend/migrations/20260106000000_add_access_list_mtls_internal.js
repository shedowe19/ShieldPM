import { migrate as logger } from "../logger.js";

const migrateName = "add_access_list_mtls_internal";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.table("access_list", (table) => {
			table.integer("mtls_use_internal").notNullable().defaultTo(0).unsigned();
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list Table updated`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.table("access_list", (table) => {
			table.dropColumn("mtls_use_internal");
		})
		.then(() => {
			logger.info(`[${migrateName}] access_list Table updated`);
		});
};

export { up, down };
