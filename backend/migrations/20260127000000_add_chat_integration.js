import { migrate as logger } from "../logger.js";

const migrateName = "add_chat_integration";

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
		.createTable("chat_integration", (table) => {
			table.increments("id").primary();
			table.string("created_on").notNullable().defaultTo(knex.fn.now());
			table.string("modified_on").notNullable().defaultTo(knex.fn.now());
			table.integer("user_id").unsigned().notNullable().references("id").inTable("user");
			table.string("provider").notNullable(); // 'telegram', 'matrix', etc.
			table.string("token").notNullable(); // Encrypted token
			table.boolean("enabled").notNullable().defaultTo(true);
			table.json("config").notNullable(); // { allowed_ids: [], ... }
			table.json("meta").notNullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] Table 'chat_integration' created`);
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

	return knex.schema.dropTable("chat_integration").then(() => {
		logger.info(`[${migrateName}] Table 'chat_integration' dropped`);
	});
};

export { down, up };
