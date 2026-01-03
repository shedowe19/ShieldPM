/**
 * Reset AI system prompt to use new default
 * This clears any old system prompts so the improved default is used
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
export const up = async function (knex) {
    // Update the ai-config setting to clear the old system_prompt
    await knex("setting")
        .where("id", "ai-config")
        .update({
            meta: knex.raw(`json_remove(meta, '$.system_prompt')`)
        });
};

/**
 * Undo Migrations
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
export const down = function (knex) {
    // No rollback needed - users can re-enter custom prompts if desired
    return Promise.resolve();
};
