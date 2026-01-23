import { migrate as logger } from "../logger.js";

const migrateName = "add_user_permission_analytics";

/**
 * Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// Add cloudflared_tunnels column if it doesn't exist
	const hasCloudflared = await knex.schema.hasColumn("user_permission", "cloudflared_tunnels");
	if (!hasCloudflared) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.string("cloudflared_tunnels").notNull().defaultTo("manage");
		});
		logger.info(`[${migrateName}] Added cloudflared_tunnels column`);
	}

	// Add analytics column if it doesn't exist
	const hasAnalytics = await knex.schema.hasColumn("user_permission", "analytics");
	if (!hasAnalytics) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.string("analytics").notNull().defaultTo("view");
		});
		logger.info(`[${migrateName}] Added analytics column`);
	}

	logger.info(`[${migrateName}] Migration complete`);
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	const hasCloudflared = await knex.schema.hasColumn("user_permission", "cloudflared_tunnels");
	if (hasCloudflared) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.dropColumn("cloudflared_tunnels");
		});
	}

	const hasAnalytics = await knex.schema.hasColumn("user_permission", "analytics");
	if (hasAnalytics) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.dropColumn("analytics");
		});
	}
};

export { up, down };
