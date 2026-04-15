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
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	const hasPool = await knex.schema.hasColumn("proxy_host", "keepalive_pool");
	const hasTimeout = await knex.schema.hasColumn("proxy_host", "keepalive_timeout");
	const hasRequests = await knex.schema.hasColumn("proxy_host", "keepalive_requests");

	return knex.schema
		.table("proxy_host", (table) => {
			if (!hasPool) table.integer("keepalive_pool").nullable().defaultTo(0);
			if (!hasTimeout) table.string("keepalive_timeout").nullable().defaultTo("60s");
			if (!hasRequests) table.integer("keepalive_requests").nullable().defaultTo(1000);
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
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	const hasPool = await knex.schema.hasColumn("proxy_host", "keepalive_pool");
	const hasTimeout = await knex.schema.hasColumn("proxy_host", "keepalive_timeout");
	const hasRequests = await knex.schema.hasColumn("proxy_host", "keepalive_requests");

	return knex.schema
		.table("proxy_host", (table) => {
			if (hasPool) table.dropColumn("keepalive_pool");
			if (hasTimeout) table.dropColumn("keepalive_timeout");
			if (hasRequests) table.dropColumn("keepalive_requests");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

export { up, down };
