import { migrate as logger } from "../logger.js";

const migrateName = "add_ai_config";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
    logger.info(`[${migrateName}] Migrating Up...`);

    const exists = await knex("setting").where("id", "ai-config").first();

    if (!exists) {
        await knex("setting").insert({
            id: "ai-config",
            name: "AI Configuration",
            description: "Configuration for the AI Agent",
            value: "false",
            meta: {
                enabled: false,
                provider: "gemini",
                api_key: "",
                base_url: "",
                model: "",
                system_prompt: "You are the AI Administrator for NPMplus. You have access to tools to control the server. Always use tools when actions are requested. Be concise. IMPORTANT: Always answer in the same language as the user.",
            },
        });
        logger.info(`[${migrateName}] AI Config setting created`);
    } else {
        logger.info(`[${migrateName}] AI Config setting already exists`);
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
    await knex("setting").where("id", "ai-config").delete();
};

export { up, down };
