import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[add_firewall_lists] Migrating Up...");
	await knex.schema.createTable("firewall_list", (table) => {
		table.increments("id").primary();
		table.string("created_on").notNullable();
		table.string("modified_on").notNullable();
		table.integer("owner_user_id").unsigned().notNullable().index();
		table.integer("is_deleted").unsigned().notNullable().defaultTo(0);
		table.string("name", 255).notNullable();
		table.text("reason").notNullable();
		table.text("description").notNullable();
		table.string("source_type", 16).notNullable().defaultTo("manual");
		table.text("source_url").notNullable();
		table.integer("update_interval_hours").unsigned().notNullable().defaultTo(24);
		table.integer("enabled").unsigned().notNullable().defaultTo(1);
		table.text("entries", "longtext").notNullable();
		table.integer("entry_count").unsigned().notNullable().defaultTo(0);
		table.string("last_updated_on").nullable();
		table.text("last_error").nullable();
	});
};

const down = async (knex) => {
	logger.info("[add_firewall_lists] Migrating Down...");
	await knex.schema.dropTable("firewall_list");
};

export { down, up };
