import { migrate as logger } from "../logger.js";

const migrateName = "add_ai_advanced_options";

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

		let changed = false;
		if (!meta.kv_cache_type) {
			meta.kv_cache_type = "f16";
			changed = true;
		}
		if (!meta.num_thread) {
			meta.num_thread = 4;
			changed = true;
		}

		if (changed) {
			await knex("setting")
				.where("id", "ai-config")
				.update({
					meta: JSON.stringify(meta),
				});
			logger.info(`[${migrateName}] Added kv_cache_type and num_thread to ai-config`);
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

		let changed = false;
		if (meta.kv_cache_type) {
			delete meta.kv_cache_type;
			changed = true;
		}
		if (meta.num_thread) {
			delete meta.num_thread;
			changed = true;
		}

		if (changed) {
			await knex("setting")
				.where("id", "ai-config")
				.update({
					meta: JSON.stringify(meta),
				});
		}
	}
};

export { up, down };
