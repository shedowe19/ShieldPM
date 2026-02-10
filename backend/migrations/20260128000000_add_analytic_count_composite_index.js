import { migrate as logger } from "../logger.js";

const migrateName = "20260128000000_add_analytic_count_composite_index.js";

/**
 * Migrate Up
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
export const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema.table("analytic_count", (table) => {
		// Add composite index for performance
		table.index(["proxy_host_id", "timestamp"], "analytic_count_proxy_host_id_timestamp_index");
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

	return knex.schema.table("analytic_count", (table) => {
		table.dropIndex(["proxy_host_id", "timestamp"], "analytic_count_proxy_host_id_timestamp_index");
	});
};
