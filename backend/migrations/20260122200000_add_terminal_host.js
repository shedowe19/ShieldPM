import { migrate as logger } from "../logger.js";

const migrateName = "add_terminal_host";

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

	return knex.schema
		.createTable("terminal_host", (table) => {
			table.increments("id").primary();
			table.dateTime("created_on").notNullable();
			table.dateTime("modified_on").notNullable();
			table.integer("owner_user_id").unsigned().notNullable().references("id").inTable("user");
			table.integer("enabled").notNullable().defaultTo(1);
			table.string("type").notNullable().defaultTo("ssh"); // ssh, telnet, etc.
			table.string("name").notNullable();
			table.string("host").notNullable();
			table.integer("port").notNullable().defaultTo(22);
			table.string("auth_type").notNullable().defaultTo("password"); // password, key
			table.string("username").notNullable();
			table.string("password"); // Encrypted
			table.string("private_key"); // Encrypted
			table.json("meta").notNullable();
			table.integer("is_deleted").notNullable().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] terminal_host Table created`);
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
	return knex.schema.dropTable("terminal_host");
};

export { up, down };
