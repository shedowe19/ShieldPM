import { migrate as logger } from "../logger.js";

const migrateName = "add_ai_token_usage";
const tableName = "ai_token_usage";

export const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	if (!(await knex.schema.hasTable(tableName))) {
		await knex.schema.createTable(tableName, (table) => {
			table.increments("id").primary();
			table.string("day", 10).notNullable().index();
			table.integer("user_id").notNullable().defaultTo(0);
			table.bigInteger("tokens").notNullable().defaultTo(0);
			table.unique(["day", "user_id"]);
		});
	}

	logger.info(`[${migrateName}] Added the shared AI token budget counter.`);
};

export const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	if (await knex.schema.hasTable(tableName)) {
		await knex.schema.dropTable(tableName);
	}
};
