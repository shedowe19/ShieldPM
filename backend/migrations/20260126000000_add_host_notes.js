import { migrate as logger } from "../logger.js";

const migrateName = "add_host_notes";

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
		.table("proxy_host", async (table) => {
			await table.text("note").nullable();
		})
		.table("redirection_host", async (table) => {
			await table.text("note").nullable();
		})
		.table("dead_host", async (table) => {
			await table.text("note").nullable();
		})
		.table("stream", async (table) => {
			await table.text("note").nullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] Tables altered`);
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
		.table("proxy_host", async (table) => {
			await table.dropColumn("note");
		})
		.table("redirection_host", async (table) => {
			await table.dropColumn("note");
		})
		.table("dead_host", async (table) => {
			await table.dropColumn("note");
		})
		.table("stream", async (table) => {
			await table.dropColumn("note");
		})
		.then(() => {
			logger.info(`[${migrateName}] Tables altered`);
		});
};

export { down, up };
