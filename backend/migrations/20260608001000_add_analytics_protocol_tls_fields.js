import { migrate as logger } from "../logger.js";

const migrateName = "add_analytics_protocol_tls_fields";

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
		.table("analytics_logs", (table) => {
			table.string("http3", 32).nullable();
			table.string("ssl_early_data", 16).nullable();
			table.string("ssl_sigalg", 128).nullable();
			table.string("ssl_client_sigalg", 128).nullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] analytics_logs protocol/TLS columns added`);
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
		.table("analytics_logs", (table) => {
			table.dropColumn("ssl_client_sigalg");
			table.dropColumn("ssl_sigalg");
			table.dropColumn("ssl_early_data");
			table.dropColumn("http3");
		})
		.then(() => {
			logger.info(`[${migrateName}] analytics_logs protocol/TLS columns dropped`);
		});
};

export { down, up };
