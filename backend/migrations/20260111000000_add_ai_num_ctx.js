import { migrate as logger } from "../logger.js";

const migrateName = "add_ai_num_ctx";

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

		if (!meta.num_ctx) {
			meta.num_ctx = 8192;
			await knex("setting")
				.where("id", "ai-config")
				.update({
					meta: JSON.stringify(meta),
				});
			logger.info(`[${migrateName}] Added num_ctx to ai-config`);
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

		if (meta.num_ctx) {
			delete meta.num_ctx;
			await knex("setting")
				.where("id", "ai-config")
				.update({
					meta: JSON.stringify(meta),
				});
		}
	}
};

export { up, down };
