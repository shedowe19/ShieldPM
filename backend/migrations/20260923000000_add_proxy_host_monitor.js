import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[add_proxy_host_monitor] Migrating Up...");
	await knex.schema.createTable("proxy_host_monitor", (table) => {
		table.increments("id").primary();
		table.integer("host_id").notNullable().unique();
		table.boolean("enabled").notNullable().defaultTo(false);
		table.string("type", 8).notNullable().defaultTo("http");
		table.string("path", 255).notNullable().defaultTo("/");
		table.integer("interval_seconds").notNullable().defaultTo(60);
		table.integer("timeout_ms").notNullable().defaultTo(5000);
		table.integer("expected_status").notNullable().defaultTo(200);
		table.boolean("alert_enabled").notNullable().defaultTo(false);
		table.integer("version").notNullable().defaultTo(1);
		table.string("state", 16).notNullable().defaultTo("unknown");
		table.string("checked_at", 40).nullable();
		table.string("next_check_at", 40).nullable().index();
		table.integer("response_ms").nullable();
		table.integer("status_code").nullable();
		table.string("message", 255).nullable();
		table.string("last_alert_at", 40).nullable();
		table.string("last_alert_state", 16).nullable();
		table.string("created_on", 40).notNullable();
		table.string("modified_on", 40).notNullable();
	});
	await knex.schema.createTable("proxy_host_monitor_check", (table) => {
		table.increments("id").primary();
		table.integer("host_id").notNullable();
		table.string("checked_at", 40).notNullable().index();
		table.string("state", 16).notNullable();
		table.integer("response_ms").nullable();
		table.integer("status_code").nullable();
		table.string("message", 255).nullable();
		table.boolean("transition").notNullable().defaultTo(false);
		table.index(["host_id", "checked_at"]);
	});
};

const down = async (knex) => {
	logger.info("[add_proxy_host_monitor] Migrating Down...");
	await knex.schema.dropTable("proxy_host_monitor_check");
	await knex.schema.dropTable("proxy_host_monitor");
};

export { down, up };
