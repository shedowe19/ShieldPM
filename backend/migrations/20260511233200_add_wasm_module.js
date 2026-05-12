import { migrate as logger } from "../logger.js";

const migrateName = "add_wasm_module";

const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("wasm_module", (table) => {
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
		})
		.then(() => {
			logger.info(`[${migrateName}] 'wasm_module' table created`);
			return knex.schema.table("proxy_host", (table) => {
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
		})
		.then(() => {
			logger.info(`[${migrateName}] 'wasm_module_id' and 'wasm_config' added to 'proxy_host'`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return knex.schema
		.table("proxy_host", (table) => {
			table.dropColumn("wasm_module_id");
			table.dropColumn("wasm_config");
		})
		.then(() => {
			logger.info(`[${migrateName}] 'wasm_module_id' and 'wasm_config' dropped from 'proxy_host'`);
			return knex.schema.dropTable("wasm_module");
		})
		.then(() => {
			logger.info(`[${migrateName}] 'wasm_module' table dropped`);
		});
};

export { up, down };
