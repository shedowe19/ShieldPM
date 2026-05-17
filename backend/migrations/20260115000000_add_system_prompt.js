import { migrate as logger } from "../logger.js";

const migrateName = "add_system_prompt";

/**
 * Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	const row = await knex("setting").where("id", "ai-config").first();
	if (row?.meta) {
		let meta = {};
		try {
			meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
		} catch (_e) {
			// ignore
		}

		// Add system_prompt if not present
		if (!meta.system_prompt) {
			meta.system_prompt = "";
			await knex("setting")
				.where("id", "ai-config")
				.update({
					meta: JSON.stringify(meta),
				});
			logger.info(`[${migrateName}] Added system_prompt to ai-config`);
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
	if (row?.meta) {
		let meta = {};
		try {
			meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
		} catch (_e) {
			// ignore
		}

		if (meta.system_prompt !== undefined) {
			delete meta.system_prompt;
			await knex("setting")
				.where("id", "ai-config")
				.update({
					meta: JSON.stringify(meta),
				});
		}
	}
};

export { down, up };
