import { migrate as logger } from "../logger.js";

const migrateName = "add_tor_onion";

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

    return knex.schema
        .createTable("tor_onion", (table) => {
            table.increments("id").primary();
            table.dateTime("created_on").notNullable();
            table.dateTime("modified_on").notNullable();
            table.integer("owner_user_id").notNullable().unsigned();
            table.integer("is_deleted").notNullable().unsigned().defaultTo(0);
            table.integer("proxy_host_id").unsigned().references("id").inTable("proxy_host").onDelete("CASCADE");
            table.string("name").notNullable();
            table.string("onion_address").nullable();
            table.text("private_key").nullable(); // Encrypted Ed25519 private key
            table.integer("virtual_port").notNullable().defaultTo(80);
            table.integer("target_port").notNullable().defaultTo(80);
            table.integer("status").notNullable().defaultTo(0); // 0=Stopped, 1=Starting, 2=Running, 3=Error
            table.json("meta").notNullable();
        })
        .then(() => {
            logger.info(`[${migrateName}] tor_onion Table created`);
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
    return knex.schema.dropTable("tor_onion");
};

export { up, down };
