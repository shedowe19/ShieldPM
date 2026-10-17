import { migrate as logger } from "../logger.js";

export const up = async (knex) => {
	logger.info("[host_revisions] Migrating Up...");
	await knex.schema.createTable("proxy_host_revision", (table) => {
		table.increments("id").primary();
		table.integer("host_id").notNullable().index();
		table.integer("actor_user_id").nullable();
		table.string("action", 32).notNullable();
		table.string("created_on", 40).notNullable();
		table.string("fingerprint", 64).notNullable();
		table.text("encrypted_snapshot", "longtext").notNullable();
		table.index(["host_id", "id"]);
	});
};
export const down = (knex) => knex.schema.dropTable("proxy_host_revision");
