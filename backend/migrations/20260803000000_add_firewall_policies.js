import { migrate as logger } from "../logger.js";

const migrateName = "add_firewall_policies";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	await knex.schema.createTable("firewall_policy", (table) => {
		table.increments("id").primary();
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();
		table.string("name", 255).notNullable().unique();
		table.integer("enabled").notNullable().defaultTo(1);
		table.string("action", 16).notNullable().defaultTo("deny");
		table.string("geo_mode", 16).notNullable().defaultTo("off");
		table.json("geo_countries").notNullable().defaultTo("[]");
		table.json("allow_cidrs").notNullable().defaultTo("[]");
		table.json("block_cidrs").notNullable().defaultTo("[]");
		table.json("feed_urls").notNullable().defaultTo("[]");
		table.integer("refresh_interval_hours").notNullable().defaultTo(24);
		table.json("feed_status").notNullable().defaultTo("{}");
		table.integer("total_cidrs").notNullable().defaultTo(0);
		table.dateTime("last_updated_on").nullable();
		table.text("last_error").nullable();
	});

	await knex.schema.alterTable("proxy_host", (table) => {
		table
			.integer("firewall_policy_id")
			.unsigned()
			.nullable()
			.references("id")
			.inTable("firewall_policy")
			.onDelete("SET NULL")
			.onUpdate("CASCADE");
		table.index(["firewall_policy_id"], "idx_proxy_host_firewall_policy_id");
	});

	logger.info(`[${migrateName}] Created firewall_policy and linked proxy_host`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropIndex(["firewall_policy_id"], "idx_proxy_host_firewall_policy_id");
		table.dropColumn("firewall_policy_id");
	});
	await knex.schema.dropTableIfExists("firewall_policy");
};

export { down, up };
