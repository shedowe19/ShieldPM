import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_zstd_toggle";

/**
 * Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.alterTable("proxy_host", (table) => {
		table.integer("zstd_enabled").notNull().unsigned().defaultTo(1);
	});

	logger.info(`[${migrateName}] Added zstd_enabled to proxy_host`);
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("zstd_enabled");
	});

	logger.info(`[${migrateName}] Removed zstd_enabled from proxy_host`);
};

export { down, up };
