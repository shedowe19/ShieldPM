import { migrate as logger } from "../logger.js";

const migrateName = "identifier_for_migrate";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} db
 * @returns {Promise}
 */
const up = (db) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// Create Table example:

	/*
	return knex.schema.createTable('notification', (table) => {
		 table.increments().primary();
		 table.string('name').notNull();
		 table.string('type').notNull();
		 table.integer('created_on').notNull();
		 table.integer('modified_on').notNull();
	 })
		.then(function () {
			logger.info('[' + migrateName + '] Notification Table created');
		});
	 */

	logger.info(`[${migrateName}] Migrating Up Complete`);

	return Promise.resolve(true);
};

/**
 * Undo Migrate
 *
 * @param   {Object} db
 * @returns {Promise}
 */
const down = (db) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	// Drop table example:

	/*
	return knex.schema.dropTable('notification')
		.then(() => {
			logger.info(`[${migrateName}] Notification Table dropped`);
		});
	*/

	logger.info(`[${migrateName}] Migrating Down Complete`);

	return Promise.resolve(true);
};

export { up, down };
