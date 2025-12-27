import { migrate as logger } from "../logger.js";

const migrateName = "analytics";

/**
 * Migrate Up
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
export const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("analytic_count", (table) => {
			table.increments("id").primary();
			table.integer("proxy_host_id").unsigned().nullable().references("id").inTable("proxy_host");
			table.string("timestamp").notNull(); // ISO 8601 string, rounded to minute/hour
			table.integer("status_code_2xx").unsigned().defaultTo(0);
			table.integer("status_code_3xx").unsigned().defaultTo(0);
			table.integer("status_code_4xx").unsigned().defaultTo(0);
			table.integer("status_code_5xx").unsigned().defaultTo(0);
			table.bigInteger("bytes_sent").unsigned().defaultTo(0);
			table.integer("request_count").unsigned().defaultTo(0);

			// Index for faster time-range queries
			table.index(["timestamp"]);
			table.index(["proxy_host_id"]);
		})
		.then(() => {
			logger.info(`[${migrateName}] analytic_count Table created`);
		});
};

/**
 * Migrate Down
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
export const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema.dropTableIfExists("analytic_count").then(() => {
		logger.info(`[${migrateName}] analytic_count Table dropped`);
	});
};
