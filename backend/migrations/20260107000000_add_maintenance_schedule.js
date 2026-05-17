import { migrate as logger } from "../logger.js";

const migrateName = "add_maintenance_schedule";

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

	return knex.schema.table("proxy_host", (table) => {
		table.dateTime("maintenance_start").nullable();
		table.dateTime("maintenance_end").nullable();
		table.text("maintenance_reason").nullable();
		table.boolean("maintenance_active").defaultTo(false).notNullable();
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

	return knex.schema.table("proxy_host", (table) => {
		table.dropColumn("maintenance_start");
		table.dropColumn("maintenance_end");
		table.dropColumn("maintenance_reason");
		table.dropColumn("maintenance_active");
	});
};

export { down, up };
