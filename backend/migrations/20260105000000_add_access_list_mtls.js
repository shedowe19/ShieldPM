import { migrate as logger } from "../logger.js";

const migrateName = "20260105000000_add_access_list_mtls";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
    logger.info(`[${migrateName}] Migrating Up...`);

    await knex.schema.table("access_list", (table) => {
        table.boolean("mtls_enabled").notNullable().defaultTo(false);
        table.text("mtls_certificate").notNullable().defaultTo("");
    });

    // Migrate existing data from meta if any
    const rows = await knex("access_list").select("id", "meta");
    for (const row of rows) {
        let meta = {};
        try {
            meta = JSON.parse(row.meta);
        } catch (e) {
            // ignore invalid json
        }

        if (meta && (meta.mtls_enabled || meta.mtls_certificate)) {
            await knex("access_list")
                .where("id", row.id)
                .update({
                    mtls_enabled: !!meta.mtls_enabled,
                    mtls_certificate: meta.mtls_certificate || "",
                    // Optionally remove from meta, but keeping it safe is also fine. 
                    // Let's remove to clean up.
                    meta: JSON.stringify({
                        ...meta,
                        mtls_enabled: undefined,
                        mtls_certificate: undefined,
                    }),
                });
        }
    }

    logger.info(`[${migrateName}] access_list Table altered`);
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
    logger.info(`[${migrateName}] Migrating Down...`);
    return knex.schema.table("access_list", (table) => {
        table.dropColumn("mtls_enabled");
        table.dropColumn("mtls_certificate");
    });
};

export { up, down };
