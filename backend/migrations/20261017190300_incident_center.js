import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[incident_center] Migrating Up...");
	await knex.schema.createTable("monitor_incident", (table) => {
		table.increments("id").primary();
		table.integer("host_id").notNullable().index();
		table.string("opened_at", 40).notNullable();
		table.string("resolved_at", 40).nullable().index();
		table.string("last_seen_at", 40).notNullable();
		table.string("resolution", 32).nullable();
		table.integer("failure_count").notNullable().defaultTo(1);
		table.string("message", 255).notNullable();
		table.index(["host_id", "resolved_at"]);
	});
	await knex.schema.createTable("monitor_observation", (table) => {
		table.integer("host_id").primary();
		table.string("checked_at", 40).notNullable();
		table.string("state", 16).notNullable();
		table.integer("interval_seconds").notNullable();
	});
	await knex.schema.createTable("monitor_daily", (table) => {
		table.increments("id").primary();
		table.integer("host_id").notNullable();
		table.string("day", 10).notNullable().index();
		table.integer("up_ms").notNullable().defaultTo(0);
		table.integer("down_ms").notNullable().defaultTo(0);
		table.integer("checks").notNullable().defaultTo(0);
		table.unique(["host_id", "day"]);
	});
	await knex.schema.createTable("monitor_latency", (table) => {
		table.increments("id").primary();
		table.integer("host_id").notNullable();
		table.string("bucket", 40).notNullable().index();
		table.integer("samples").notNullable().defaultTo(0);
		table.bigInteger("total_ms").notNullable().defaultTo(0);
		table.integer("min_ms").nullable();
		table.integer("max_ms").nullable();
		table.unique(["host_id", "bucket"]);
	});
	await knex.schema.createTable("monitor_mute", (table) => {
		table.integer("host_id").primary();
		table.string("starts_at", 40).notNullable();
		table.string("ends_at", 40).notNullable();
		table.string("reason", 255).notNullable().defaultTo("");
	});
	await knex.schema.createTable("notification_target", (table) => {
		table.increments("id").primary();
		table.integer("owner_user_id").notNullable().index();
		table.string("name", 100).notNullable();
		table.string("type", 16).notNullable();
		table.boolean("enabled").notNullable().defaultTo(true);
		table.text("host_ids").notNullable();
		table.text("secret").notNullable();
		table.integer("version").notNullable().defaultTo(1);
		table.string("created_on", 40).notNullable();
		table.string("modified_on", 40).notNullable();
	});
	await knex.schema.createTable("notification_delivery", (table) => {
		table.increments("id").primary();
		table.integer("target_id").notNullable().index();
		table.integer("incident_id").notNullable();
		table.integer("host_id").notNullable().index();
		table.string("event", 32).notNullable();
		table.text("payload").notNullable();
		table.string("status", 16).notNullable().defaultTo("pending");
		table.integer("attempts").notNullable().defaultTo(0);
		table.string("next_attempt_at", 40).notNullable();
		table.string("last_error", 255).nullable();
		table.string("created_on", 40).notNullable().index();
		table.string("sent_at", 40).nullable();
		table.index(["status", "next_attempt_at"]);
		table.unique(["incident_id", "event", "target_id"]);
	});
};

const down = async (knex) => {
	for (const table of [
		"notification_delivery",
		"notification_target",
		"monitor_mute",
		"monitor_latency",
		"monitor_daily",
		"monitor_observation",
		"monitor_incident",
	])
		await knex.schema.dropTableIfExists(table);
};

export { down, up };
