import { migrate as logger } from "../logger.js";

const migrateName = "add_user_avatar";

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
		.table("user", (table) => {
			table.string("avatar_type").notNullable().defaultTo("gravatar");
			table.string("avatar_value").nullable().defaultTo(null);
		})
		.then(() => {
			logger.info(`[${migrateName}] Columns 'avatar_type' and 'avatar_value' added to 'user'`);
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
		.table("user", (table) => {
			table.dropColumn("avatar_type");
			table.dropColumn("avatar_value");
		})
		.then(() => {
			logger.info(`[${migrateName}] Columns 'avatar_type' and 'avatar_value' dropped from 'user'`);
		});
};

export { down, up };
