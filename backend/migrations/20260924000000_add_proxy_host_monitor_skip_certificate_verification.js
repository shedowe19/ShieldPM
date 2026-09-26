import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[add_proxy_host_monitor_skip_certificate_verification] Migrating Up...");
	if (!(await knex.schema.hasColumn("proxy_host_monitor", "skip_certificate_verification"))) {
		await knex.schema.alterTable("proxy_host_monitor", (table) => {
			table.boolean("skip_certificate_verification").notNullable().defaultTo(false);
		});
	}
};

const down = async (knex) => {
	logger.info("[add_proxy_host_monitor_skip_certificate_verification] Migrating Down...");
	if (await knex.schema.hasColumn("proxy_host_monitor", "skip_certificate_verification")) {
		await knex.schema.alterTable("proxy_host_monitor", (table) => {
			table.dropColumn("skip_certificate_verification");
		});
	}
};

export { down, up };
