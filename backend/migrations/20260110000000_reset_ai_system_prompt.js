/**
 * Reset AI system prompt to use new default
 * This clears any old system prompts so the improved default is used
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	// Drivers return JSON either as text or as an object. Avoid engine-specific
	// JSON functions so this historical migration also works on PostgreSQL.
	const row = await knex("setting").where("id", "ai-config").first();
	if (!row?.meta) return;
	const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
	if (!meta || typeof meta !== "object" || Array.isArray(meta)) return;
	delete meta.system_prompt;
	await knex("setting")
		.where("id", "ai-config")
		.update({ meta: JSON.stringify(meta) });
};

/**
 * Undo Migrations
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (_knex) => {
	// No rollback needed - users can re-enter custom prompts if desired
	return Promise.resolve();
};

export { down, up };
