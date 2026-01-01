import { migrate as logger } from "../logger.js";

const migrateName = "add_cloudflared_tunnel";

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

    return knex.schema.createTable("cloudflared_tunnel", (table) => {
        table.increments("id").primary();
        table.dateTime("created_on").notNullable();
        table.dateTime("modified_on").notNullable();
        table.integer("owner_user_id").notNullable().unsigned();
        table.integer("is_deleted").notNullable().unsigned().defaultTo(0);
        table.string("name").notNullable();
        table.string("token").notNullable();
        table.integer("status").notNullable().defaultTo(0);
        table.json("meta").notNullable();
    })
        .then(() => {
            logger.info(`[${migrateName}] cloudflared_tunnel Table created`);
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
    return knex.schema.dropTable("cloudflared_tunnel");
};

export { up, down };
