import { migrate as logger } from "../logger.js";

const migrateName = "add_req_limit_legacy_placeholder";

/**
 * Migrate - Placeholder to fix "corrupt migration directory" error.
 * The original file was renamed, but the DB expects this file to exist.
 * This does nothing as the actual changes are now in 20260102000000_add_req_limit.js
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Placeholder for corrupted migration check. Doing nothing.`);
	return Promise.resolve();
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Placeholder for corrupted migration check. Doing nothing.`);
	return Promise.resolve();
};

export { up, down };
