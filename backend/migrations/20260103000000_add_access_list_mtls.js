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
const up = async (knex) => {
    logger.info(`[${migrateName}] Restored as dummy to fix migration corruption.`);
    return Promise.resolve();
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
    return Promise.resolve();
};

export { up, down };
