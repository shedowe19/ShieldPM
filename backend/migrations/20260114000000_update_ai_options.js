import { migrate as logger } from "../logger.js";

const migrateName = "update_ai_options";

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

		let changed = false;

		// Add keep_alive
		if (!meta.keep_alive) {
			meta.keep_alive = "5m";
			changed = true;
		}

		// Remove kv_cache_type
		if (meta.kv_cache_type) {
			delete meta.kv_cache_type;
			changed = true;
		}

		if (changed) {
			await knex("setting")
				.where("id", "ai-config")
				.update({
					meta: JSON.stringify(meta),
				});
			logger.info(`[${migrateName}] Added keep_alive, removed kv_cache_type`);
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

		let changed = false;

		if (meta.keep_alive) {
			delete meta.keep_alive;
			changed = true;
		}

		if (!meta.kv_cache_type) {
			meta.kv_cache_type = "f16";
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

export { down, up };
