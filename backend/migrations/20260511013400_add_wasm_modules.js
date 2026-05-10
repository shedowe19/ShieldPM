import { migrate as logger } from "../logger.js";

const migrateName = "add_wasm_modules";

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
		.createTable("wasm_module", async (table) => {
			table.increments("id").primary();
			table.string("created_on").notNullable();
			table.string("modified_on").notNullable();
			table.integer("owner_user_id").notNullable();
			table.string("name").notNullable();
			table.string("description").nullable();
			table.string("file_name").notNullable();
			table.json("meta").notNullable().defaultTo("{}");
			table.integer("is_deleted").notNullable().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] wasm_module Table created`);
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

	return knex.schema.dropTable("wasm_module").then(() => {
		logger.info(`[${migrateName}] wasm_module Table dropped`);
	});
};

export { up, down };
