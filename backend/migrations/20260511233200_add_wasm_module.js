import { migrate as logger } from "../logger.js";

const migrateName = "add_wasm_module";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	const tableExists = await knex.schema.hasTable("wasm_module");
	if (!tableExists) {
		await knex.schema.createTable("wasm_module", (table) => {
			table.increments("id").primary();
			table.dateTime("created_on").notNullable();
			table.dateTime("modified_on").notNullable();
			table
				.integer("owner_user_id")
				.notNullable()
				.unsigned()
				.references("id")
				.inTable("user")
				.onDelete("CASCADE");
			table.string("name").notNullable();
			table.text("description").notNullable().defaultTo("");
			table.string("filename").notNullable();
			table.integer("is_deleted").notNullable().defaultTo(0);
			table.index("owner_user_id");
		});
		logger.info(`[${migrateName}] 'wasm_module' table created`);
	} else {
		logger.info(`[${migrateName}] 'wasm_module' table already exists, skipping`);
	}

	const hasWasmModuleId = await knex.schema.hasColumn("proxy_host", "wasm_module_id");
	if (!hasWasmModuleId) {
		await knex.schema.table("proxy_host", (table) => {
			table
				.integer("wasm_module_id")
				.unsigned()
				.defaultTo(0)
				.references("id")
				.inTable("wasm_module")
				.onDelete("CASCADE");
			table.text("wasm_config").notNullable().defaultTo("");
			table.index("wasm_module_id");
		});
		logger.info(`[${migrateName}] 'wasm_module_id' and 'wasm_config' added to 'proxy_host'`);
	} else {
		logger.info(`[${migrateName}] 'proxy_host' columns already exist, skipping`);
	}
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	const hasWasmModuleId = await knex.schema.hasColumn("proxy_host", "wasm_module_id");
	if (hasWasmModuleId) {
		await knex.schema.table("proxy_host", (table) => {
			table.dropColumn("wasm_module_id");
			table.dropColumn("wasm_config");
		});
		logger.info(`[${migrateName}] 'wasm_module_id' and 'wasm_config' dropped from 'proxy_host'`);
	}

	const tableExists = await knex.schema.hasTable("wasm_module");
	if (tableExists) {
		await knex.schema.dropTable("wasm_module");
		logger.info(`[${migrateName}] 'wasm_module' table dropped`);
	}
};

export { up, down };
