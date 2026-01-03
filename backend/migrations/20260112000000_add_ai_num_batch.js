import { migrate as logger } from "../logger.js";

const migrateName = "add_ai_num_batch";

/**
 * Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
    logger.info(`[${migrateName}] Migrating Up...`);

    const row = await knex("setting").where("id", "ai-config").first();
    if (row && row.meta) {
        let meta = {};
        try {
            meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
        } catch (e) {
            // ignore
        }

        if (!meta.num_batch) {
            meta.num_batch = 512;
            await knex("setting").where("id", "ai-config").update({
                meta: JSON.stringify(meta)
            });
            logger.info(`[${migrateName}] Added num_batch to ai-config`);
        }
    }
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (knex) => {
    logger.info(`[${migrateName}] Migrating Down...`);
    const row = await knex("setting").where("id", "ai-config").first();
    if (row && row.meta) {
        let meta = {};
        try {
            meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
        } catch (e) {
            // ignore
        }

        if (meta.num_batch) {
            delete meta.num_batch;
            await knex("setting").where("id", "ai-config").update({
                meta: JSON.stringify(meta)
            });
        }
    }
};

export { up, down };
