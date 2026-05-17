import { migrate as logger } from "../logger.js";

const migrateName = "add_missing_permissions";

/**
 * Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// Add dashboard_notes column if it doesn't exist
	const hasNotes = await knex.schema.hasColumn("user_permission", "dashboard_notes");
	if (!hasNotes) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.string("dashboard_notes").notNull().defaultTo("manage");
		});
		logger.info(`[${migrateName}] Added dashboard_notes column`);
	}

	// Add ddns_providers column if it doesn't exist
	const hasDdns = await knex.schema.hasColumn("user_permission", "ddns_providers");
	if (!hasDdns) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.string("ddns_providers").notNull().defaultTo("manage");
		});
		logger.info(`[${migrateName}] Added ddns_providers column`);
	}

	// Add tor_onions column if it doesn't exist
	const hasTor = await knex.schema.hasColumn("user_permission", "tor_onions");
	if (!hasTor) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.string("tor_onions").notNull().defaultTo("manage");
		});
		logger.info(`[${migrateName}] Added tor_onions column`);
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

	const hasNotes = await knex.schema.hasColumn("user_permission", "dashboard_notes");
	if (hasNotes) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.dropColumn("dashboard_notes");
		});
	}

	const hasDdns = await knex.schema.hasColumn("user_permission", "ddns_providers");
	if (hasDdns) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.dropColumn("ddns_providers");
		});
	}

	const hasTor = await knex.schema.hasColumn("user_permission", "tor_onions");
	if (hasTor) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.dropColumn("tor_onions");
		});
	}
};

export { down, up };
