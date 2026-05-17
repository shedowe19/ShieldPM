import { migrate as logger } from "../logger.js";

const migrateName = "20260103000000_add_access_list_mtls";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (_knex) => {
	logger.info(`[${migrateName}] Restored as dummy to fix migration corruption.`);
	return Promise.resolve();
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (_knex) => {
	return Promise.resolve();
};

export { down, up };
