import { migrate as logger } from "../logger.js";

const migrateName = "fix_req_limit_columns";

const addColumnIfMissing = async (knex, columnName, columnTypeCallback) => {
	if (await knex.schema.hasColumn("proxy_host", columnName)) {
		logger.info(`[${migrateName}] Column ${columnName} already exists. Skipping.`);
		return;
	}

	await knex.schema.table("proxy_host", (table) => {
		columnTypeCallback(table);
	});
	logger.info(`[${migrateName}] Added column ${columnName}`);
};

/**
 * Migrate Up
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// adv_limit_req_rate (integer)
	await addColumnIfMissing(knex, "adv_limit_req_rate", (table) => {
		table.integer("adv_limit_req_rate").nullable().defaultTo(null);
	});

	// adv_limit_req_unit (string)
	await addColumnIfMissing(knex, "adv_limit_req_unit", (table) => {
		table.string("adv_limit_req_unit").nullable().defaultTo(null);
	});

	// adv_limit_req_burst (integer)
	await addColumnIfMissing(knex, "adv_limit_req_burst", (table) => {
		table.integer("adv_limit_req_burst").nullable().defaultTo(null);
	});

	logger.info(`[${migrateName}] Completed.`);
};

/**
 * Migrate Down
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (_knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	// We don't strictly need to remove them here as the previous migration owns them conceptually,
	// but we can try removing them safely if needed.
	// For now, leaving empty to avoid conflict with the original migration's down script.
};

export { down, up };
