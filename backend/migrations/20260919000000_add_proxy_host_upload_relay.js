import { migrate as logger } from "../logger.js";

const migrateName = "add_proxy_host_upload_relay";

const relayColumns = [
	{
		name: "upload_relay_enabled",
		define: (table) => table.boolean("upload_relay_enabled").notNullable().defaultTo(false),
	},
	{
		name: "upload_relay_chunk_size",
		define: (table) =>
			table
				.integer("upload_relay_chunk_size")
				.notNullable()
				.defaultTo(80 * 1024 * 1024),
	},
	{
		name: "upload_relay_cleanup_hours",
		define: (table) => table.integer("upload_relay_cleanup_hours").notNullable().defaultTo(24),
	},
	{
		name: "upload_relay_max_file_size",
		define: (table) =>
			table
				.bigInteger("upload_relay_max_file_size")
				.notNullable()
				.defaultTo(10 * 1024 * 1024 * 1024),
	},
	{
		name: "upload_relay_max_pending_bytes",
		define: (table) =>
			table
				.bigInteger("upload_relay_max_pending_bytes")
				.notNullable()
				.defaultTo(20 * 1024 * 1024 * 1024),
	},
	{
		name: "upload_relay_path",
		define: (table) => table.string("upload_relay_path", 255).notNullable().defaultTo("/_shieldpm-upload"),
	},
	{
		name: "upload_relay_target_path",
		define: (table) => table.string("upload_relay_target_path", 1024).notNullable().defaultTo("/"),
	},
];

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	for (const column of relayColumns) {
		if (!(await knex.schema.hasColumn("proxy_host", column.name))) {
			await knex.schema.alterTable("proxy_host", column.define);
		}
	}
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	for (const column of [...relayColumns].reverse()) {
		if (await knex.schema.hasColumn("proxy_host", column.name)) {
			await knex.schema.alterTable("proxy_host", (table) => table.dropColumn(column.name));
		}
	}
};

export { down, up };
