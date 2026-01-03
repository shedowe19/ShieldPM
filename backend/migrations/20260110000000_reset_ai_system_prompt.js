/**
 * Reset AI system prompt to use new default
 * This clears any old system prompts so the improved default is used
 */
export async function up(knex) {
    // Update the ai-config setting to clear the old system_prompt
    await knex("setting")
        .where("id", "ai-config")
        .update({
            meta: knex.raw(`json_remove(meta, '$.system_prompt')`)
        });
}

export function down(knex) {
    // No rollback needed - users can re-enter custom prompts if desired
    return Promise.resolve();
}
