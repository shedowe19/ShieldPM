import { migrate as logger } from "../logger.js";

const migrateName = "add_proxy_host_zstd_compression";

export async function up(knex) {
	logger.info(`[${migrateName}] Migrating Up...`);
	await knex.schema.alterTable("proxy_host", (table) => {
		table.boolean("zstd_enabled").notNullable().defaultTo(false);
	});
	logger.info(`[${migrateName}] proxy_host Table altered`);
}

export async function down(knex) {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("zstd_enabled");
	});
	logger.info(`[${migrateName}] proxy_host Table altered`);
}
