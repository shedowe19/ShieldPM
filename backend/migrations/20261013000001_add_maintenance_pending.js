import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[add_maintenance_pending] Migrating Up...");
	if (!(await knex.schema.hasColumn("proxy_host", "maintenance_pending"))) {
		await knex.schema.alterTable("proxy_host", (table) => {
			table.boolean("maintenance_pending").notNullable().defaultTo(false);
		});
	}
};

const down = async (knex) => {
	logger.info("[add_maintenance_pending] Migrating Down...");
	if (await knex.schema.hasColumn("proxy_host", "maintenance_pending")) {
		await knex.schema.alterTable("proxy_host", (table) => {
			table.dropColumn("maintenance_pending");
		});
	}
};

export { down, up };
