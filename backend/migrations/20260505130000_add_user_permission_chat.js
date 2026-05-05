import { migrate as logger } from "../logger.js";

const migrateName = "add_user_permission_chat";

/**
 * Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// Add chat column if it doesn't exist
	const hasChat = await knex.schema.hasColumn("user_permission", "chat");
	if (!hasChat) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.string("chat").notNull().defaultTo("manage");
		});
		logger.info(`[${migrateName}] Added chat column`);
	}

	logger.info(`[${migrateName}] Migration complete`);
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	const hasChat = await knex.schema.hasColumn("user_permission", "chat");
	if (hasChat) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.dropColumn("chat");
		});
	}

	logger.info(`[${migrateName}] Migration complete`);
};

export { up, down };