/**
 * Reset AI system prompt to use new default
 * This clears any old system prompts so the improved default is used
 */
exports.up = async function (knex) {
    // Update the ai-config setting to clear the old system_prompt
    await knex("setting")
        .where("id", "ai-config")
        .update({
            meta: knex.raw(`json_set(meta, '$.system_prompt', NULL)`)
        });
};

exports.down = function (knex) {
    // No rollback needed - users can re-enter custom prompts if desired
    return Promise.resolve();
};
