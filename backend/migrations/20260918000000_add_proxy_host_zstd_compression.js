import { migrate as logger } from "../logger.js";

const migrateName = "add_proxy_host_zstd_compression";

export async function up(knex) {
	logger.info(`[${migrateName}] Migrating Up...`);
	if (!(await knex.schema.hasColumn("proxy_host", "zstd_enabled"))) {
		await knex.schema.alterTable("proxy_host", (table) => {
			table.boolean("zstd_enabled").notNullable().defaultTo(false);
		});
		logger.info(`[${migrateName}] proxy_host Table altered`);
		return;
	}
	logger.info(`[${migrateName}] zstd_enabled already exists; preserving interrupted migration state`);
}

export async function down(knex) {
	logger.info(`[${migrateName}] Migrating Down...`);
	if (!(await knex.schema.hasColumn("proxy_host", "zstd_enabled"))) {
		logger.info(`[${migrateName}] zstd_enabled already absent`);
		return;
	}
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("zstd_enabled");
	});
	logger.info(`[${migrateName}] proxy_host Table altered`);
}
