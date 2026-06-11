import { migrate as logger } from "../logger.js";

const migrateName = "monitoring";

/**
 * @param {Object} knex
 * @returns {Promise<void>}
 */
export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	const hasMonitor = await knex.schema.hasTable("monitor");
	if (!hasMonitor) {
		await knex.schema.createTable("monitor", (table) => {
			table.increments("id").primary();
			table.string("created_on").notNull();
			table.string("modified_on").notNull();
			table.integer("owner_user_id").unsigned().notNull().references("id").inTable("user");
			table.integer("proxy_host_id").unsigned().nullable().references("id").inTable("proxy_host");
			table.string("name").notNull();
			table.string("type").notNull().defaultTo("http");
			table.string("url").notNull();
			table.string("method").notNull().defaultTo("GET");
			table.integer("interval_seconds").unsigned().notNull().defaultTo(60);
			table.integer("timeout_seconds").unsigned().notNull().defaultTo(5);
			table.integer("expected_status").unsigned().notNull().defaultTo(200);
			table.text("expected_body").nullable();
			table.integer("failure_threshold").unsigned().notNull().defaultTo(3);
			table.integer("consecutive_failures").unsigned().notNull().defaultTo(0);
			table.string("status").notNull().defaultTo("pending");
			table.string("last_checked_on").nullable();
			table.string("last_success_on").nullable();
			table.string("last_failure_on").nullable();
			table.integer("last_latency_ms").unsigned().nullable();
			table.integer("last_http_status").unsigned().nullable();
			table.text("last_error").nullable();
			table.integer("enabled").notNull().defaultTo(1);
			table.integer("notification_enabled").notNull().defaultTo(1);
			table.integer("is_deleted").notNull().defaultTo(0);
			table.json("meta").notNull().defaultTo("{}");
			table.index(["enabled", "is_deleted"]);
			table.index(["proxy_host_id"]);
			table.index(["status"]);
		});
		logger.info(`[${migrateName}] monitor table created`);
	}

	const hasMonitorCheck = await knex.schema.hasTable("monitor_check");
	if (!hasMonitorCheck) {
		await knex.schema.createTable("monitor_check", (table) => {
			table.increments("id").primary();
			table.integer("monitor_id").unsigned().notNull().references("id").inTable("monitor").onDelete("CASCADE");
			table.string("checked_on").notNull();
			table.string("status").notNull();
			table.integer("latency_ms").unsigned().nullable();
			table.integer("http_status").unsigned().nullable();
			table.text("error").nullable();
			table.text("response_excerpt").nullable();
			table.index(["monitor_id", "checked_on"]);
			table.index(["status"]);
		});
		logger.info(`[${migrateName}] monitor_check table created`);
	}

	const hasMonitoringPermission = await knex.schema.hasColumn("user_permission", "monitoring");
	if (!hasMonitoringPermission) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.string("monitoring").notNull().defaultTo("view");
		});
		logger.info(`[${migrateName}] user_permission.monitoring column added`);
	}
};

/**
 * @param {Object} knex
 * @returns {Promise<void>}
 */
export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	const hasMonitoringPermission = await knex.schema.hasColumn("user_permission", "monitoring");
	if (hasMonitoringPermission) {
		await knex.schema.alterTable("user_permission", (table) => {
			table.dropColumn("monitoring");
		});
	}
	await knex.schema.dropTableIfExists("monitor_check");
	await knex.schema.dropTableIfExists("monitor");
};
