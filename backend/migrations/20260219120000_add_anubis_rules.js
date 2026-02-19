import { migrate as logger } from "../logger.js";

const migrateName = "add_anubis_rules";

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
			table.json("anubis_rules").nullable().defaultTo(null);
		})
		.then(() => {
			logger.info(`[${migrateName}] Column 'anubis_rules' created`);
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

	return knex.schema.table("proxy_host", (table) => {
		table.dropColumn("anubis_rules");
	});
};

export { up, down };
