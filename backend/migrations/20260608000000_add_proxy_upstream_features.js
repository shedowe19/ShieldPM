import { migrate as logger } from "../logger.js";

const migrateName = "add_proxy_upstream_features";

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
			table.json("upstream_servers").nullable().defaultTo(null);
			table.string("load_balancing_method", 32).notNullable().defaultTo("round_robin");
			table.string("upstream_http_version", 3).notNullable().defaultTo("1.1");
			table.integer("ssl_early_data").notNullable().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host upstream feature columns added`);
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
			table.dropColumn("ssl_early_data");
			table.dropColumn("upstream_http_version");
			table.dropColumn("load_balancing_method");
			table.dropColumn("upstream_servers");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host upstream feature columns dropped`);
		});
};

export { down, up };
