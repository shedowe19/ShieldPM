import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[add_proxy_host_monitor_tls_options] Migrating Up...");
	if (!(await knex.schema.hasColumn("proxy_host_monitor", "upstream_ca"))) {
		await knex.schema.alterTable("proxy_host_monitor", (table) => {
			table.text("upstream_ca").nullable();
		});
	}
	if (!(await knex.schema.hasColumn("proxy_host_monitor", "upstream_server_name"))) {
		await knex.schema.alterTable("proxy_host_monitor", (table) => {
			table.string("upstream_server_name", 253).nullable();
		});
	}
};

const down = async (knex) => {
	logger.info("[add_proxy_host_monitor_tls_options] Migrating Down...");
	if (await knex.schema.hasColumn("proxy_host_monitor", "upstream_server_name")) {
		await knex.schema.alterTable("proxy_host_monitor", (table) => {
			table.dropColumn("upstream_server_name");
		});
	}
	if (await knex.schema.hasColumn("proxy_host_monitor", "upstream_ca")) {
		await knex.schema.alterTable("proxy_host_monitor", (table) => {
			table.dropColumn("upstream_ca");
		});
	}
};

export { down, up };
