import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[add_terminal_host_fingerprint] Migrating Up...");
	if (!(await knex.schema.hasColumn("proxy_host", "terminal_host_fingerprint"))) {
		await knex.schema.alterTable("proxy_host", (table) => {
			table.string("terminal_host_fingerprint", 50).nullable().defaultTo(null);
		});
	}
};

const down = async (knex) => {
	logger.info("[add_terminal_host_fingerprint] Migrating Down...");
	if (await knex.schema.hasColumn("proxy_host", "terminal_host_fingerprint")) {
		await knex.schema.alterTable("proxy_host", (table) => {
			table.dropColumn("terminal_host_fingerprint");
		});
	}
};

export { down, up };
