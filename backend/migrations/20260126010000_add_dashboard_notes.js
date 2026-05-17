import { migrate as logger } from "../logger.js";

const migrateName = "add_dashboard_notes";

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
		.createTable("dashboard_note", async (table) => {
			table.increments("id").primary();
			table.text("content").notNullable();
			table.string("color").defaultTo("yellow");
			table.integer("position").defaultTo(0);
			table.string("created_on").notNullable();
			table.string("modified_on").notNullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] dashboard_note Table created`);
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

	return knex.schema.dropTable("dashboard_note").then(() => {
		logger.info(`[${migrateName}] dashboard_note Table dropped`);
	});
};

export { down, up };
