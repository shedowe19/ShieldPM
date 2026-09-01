/**
 * Reset AI system prompt to use new default
 * This clears any old system prompts so the improved default is used
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	const row = await knex("setting").where("id", "ai-config").first();
	if (!row?.meta) return;

	let meta = row.meta;
	if (typeof meta === "string") {
		try {
			meta = JSON.parse(meta);
		} catch (_error) {
			return;
		}
	}

	if (typeof meta !== "object" || Array.isArray(meta) || !Object.hasOwn(meta, "system_prompt")) return;

	const nextMeta = { ...meta };
	delete nextMeta.system_prompt;

	// Serialize explicitly so SQLite, MySQL, and PostgreSQL all receive the same JSON value.
	await knex("setting")
		.where("id", "ai-config")
		.update({
			meta: JSON.stringify(nextMeta),
		});
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
