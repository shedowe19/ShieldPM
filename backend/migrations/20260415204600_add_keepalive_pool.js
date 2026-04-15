import { migrate as logger } from "../logger.js";

const migrateName = "add_keepalive_pool";

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
		.table("proxy_host", async (table) => {
			await table.integer("keepalive_pool").nullable().defaultTo(0);
			await table.string("keepalive_timeout").nullable().defaultTo("60s");
			await table.integer("keepalive_requests").nullable().defaultTo(1000);
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
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
		.table("proxy_host", async (table) => {
			await table.dropColumn("keepalive_pool");
			await table.dropColumn("keepalive_timeout");
			await table.dropColumn("keepalive_requests");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

export { up, down };
