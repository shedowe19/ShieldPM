import { migrate as logger } from "../logger.js";

const migrateName = "add_analytics_nginx_options";
const settingIds = ["analytics-options", "nginx-options"];

/**
 * Preserve valid legacy retention values and protect history for invalid values.
 *
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
const importRetention = (key, fallback) => {
	const raw = process.env[key];
	if (!raw) return fallback;
	const value = Number.parseInt(raw, 10);
	if (Number.isSafeInteger(value) && value > 0) return value;
	logger.warn(`[${migrateName}] Invalid legacy ${key}; preserving history until retention is configured.`);
	return Number.MAX_SAFE_INTEGER;
};

/**
 * Import analytics retention and Nginx formatting options once for missing rows.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	const existingIds = new Set((await knex("setting").whereIn("id", settingIds).select("id")).map(({ id }) => id));
	const rows = [];
	if (!existingIds.has("analytics-options")) {
		rows.push({
			id: "analytics-options",
			name: "Analytics Options",
			description: "Retention periods for detailed access logs and aggregated traffic statistics",
			value: "configured",
			meta: JSON.stringify({
				detailed_retention_hours: importRetention("ANALYTICS_DETAILED_RETENTION_HOURS", 24),
				aggregation_retention_days: importRetention("ANALYTICS_AGGREGATION_RETENTION_DAYS", 35),
			}),
		});
	}
	if (!existingIds.has("nginx-options")) {
		rows.push({
			id: "nginx-options",
			name: "Nginx Options",
			description: "Formatting of generated Nginx configurations",
			value: "configured",
			meta: JSON.stringify({ beautifier_enabled: process.env.DISABLE_NGINX_BEAUTIFIER !== "true" }),
		});
	}
	if (rows.length) {
		await knex("setting").insert(rows).onConflict("id").ignore();
	}
};

/**
 * Remove only the analytics and Nginx options introduced by this migration.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex("setting").whereIn("id", settingIds).delete();
};

export { down, up };
