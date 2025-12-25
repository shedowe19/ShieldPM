import { migrate as logger } from "../logger.js";

const migrateName = "add_maintenance_failure";

export const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema.table("proxy_host", (table) => {
		table.integer("maintenance_on_failure").notNull().unsigned().defaultTo(0);
	});
};

export const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema.table("proxy_host", (table) => {
		table.dropColumn("maintenance_on_failure");
	});
};
