import { migrate as logger } from "../logger.js";

const migrateName = "security_detection";

/**
 * Persisted security incidents. They are separate from `monitor_incident`
 * because availability incidents are bound to a proxy host, while security
 * events may be instance-wide, user-scoped or IP-scoped.
 *
 * @param {import("knex").Knex} knex
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	await knex.schema.createTable("security_incident", (table) => {
		table.increments("id").primary();
		table.string("created_on", 40).notNullable().index();
		table.string("last_seen_at", 40).notNullable().index();
		table.string("rule_id", 32).notNullable().index();
		table.string("severity", 16).notNullable().index();
		table.string("status", 16).notNullable().defaultTo("open").index();
		table.string("dedup_key", 160).notNullable();
		table.string("title", 160).notNullable();
		table.string("message", 255).notNullable();
		table.integer("actor_user_id").nullable();
		table.string("actor_type", 16).nullable();
		table.integer("user_id").nullable();
		table.string("ip", 45).nullable();
		table.string("request_id", 64).nullable();
		table.string("session_id", 64).nullable();
		table.integer("audit_log_id").nullable();
		table.integer("count").notNullable().defaultTo(1);
		table.text("meta").nullable();
		table.string("resolved_at", 40).nullable();
		table.index(["dedup_key", "last_seen_at"]);
		table.index(["status", "severity"]);
	});
};

/**
 * @param {import("knex").Knex} knex
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists("security_incident");
};

export { down, up };
