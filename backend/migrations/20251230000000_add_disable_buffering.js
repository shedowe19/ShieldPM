import { migrate as logger } from "../logger.js";

const migrateName = "add_disable_buffering";

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

    return knex.schema.table("proxy_host", (table) => {
        table.integer("disable_buffering").notNull().unsigned().defaultTo(0);
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

    return knex.schema.table("proxy_host", (table) => {
        table.dropColumn("disable_buffering");
    });
};

export { up, down };
