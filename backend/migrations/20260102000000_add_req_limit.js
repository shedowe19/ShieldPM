import { migrate as logger } from "../logger.js";

const migrateName = "add_req_limit";

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

	const hasRate = await knex.schema.hasColumn("proxy_host", "adv_limit_req_rate");
	if (!hasRate) {
		await knex.schema.table("proxy_host", (table) => {
			table.integer("adv_limit_req_rate").nullable().defaultTo(null);
		});
	}

	const hasUnit = await knex.schema.hasColumn("proxy_host", "adv_limit_req_unit");
	if (!hasUnit) {
		await knex.schema.table("proxy_host", (table) => {
			table.string("adv_limit_req_unit").nullable().defaultTo(null);
		});
	}

	const hasBurst = await knex.schema.hasColumn("proxy_host", "adv_limit_req_burst");
	if (!hasBurst) {
		await knex.schema.table("proxy_host", (table) => {
			table.integer("adv_limit_req_burst").nullable().defaultTo(null);
		});
	}

	logger.info(`[${migrateName}] proxy_host Table altered`);
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
			await table.dropColumn("adv_limit_req_rate");
			await table.dropColumn("adv_limit_req_unit");
			await table.dropColumn("adv_limit_req_burst");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host Table altered`);
		});
};

export { up, down };
