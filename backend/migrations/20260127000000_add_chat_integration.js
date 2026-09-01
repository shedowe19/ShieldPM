import { migrate as logger } from "../logger.js";

const migrateName = "add_chat_integration";
const tableName = "chat_integration";
const foreignKeyName = "chat_integration_user_id_foreign";
const requiredColumns = [
	"id",
	"created_on",
	"modified_on",
	"user_id",
	"provider",
	"token",
	"enabled",
	"config",
	"meta",
];

const resultRows = (result) => {
	const rows = result?.rows ?? (Array.isArray(result?.[0]) ? result[0] : result);
	return Array.isArray(rows) ? rows : [];
};

const hasUserForeignKey = async (knex) => {
	const client = String(knex.client.config.client);
	if (client.includes("sqlite")) {
		const rows = resultRows(await knex.raw('PRAGMA foreign_key_list("chat_integration")'));
		return rows.some((row) => row.from === "user_id" && row.table === "user" && row.to === "id");
	}

	if (client.includes("mysql")) {
		const rows = resultRows(
			await knex.raw(
				`SELECT constraint_name FROM information_schema.table_constraints
				 WHERE constraint_schema = DATABASE() AND table_name = ?
				   AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'`,
				[tableName, foreignKeyName],
			),
		);
		return rows.length > 0;
	}

	if (client === "pg" || client.includes("postgres")) {
		const rows = resultRows(
			await knex.raw(
				`SELECT constraint_name FROM information_schema.table_constraints
				 WHERE table_schema = current_schema() AND table_name = ?
				   AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'`,
				[tableName, foreignKeyName],
			),
		);
		return rows.length > 0;
	}

	throw new Error(`Unsupported database client for ${tableName} migration: ${client}`);
};

const assertExpectedColumns = async (knex) => {
	const columns = await knex(tableName).columnInfo();
	const missing = requiredColumns.filter((column) => !(column in columns));
	if (missing.length > 0) {
		throw new Error(`Existing ${tableName} table is missing required columns: ${missing.join(", ")}`);
	}
};

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	if (await knex.schema.hasTable(tableName)) {
		await assertExpectedColumns(knex);
		logger.info(`[${migrateName}] Table '${tableName}' already exists; checking schema`);
	} else {
		await knex.schema.createTable(tableName, (table) => {
			table.increments("id").primary();
			table.dateTime("created_on").notNullable().defaultTo(knex.fn.now());
			table.dateTime("modified_on").notNullable().defaultTo(knex.fn.now());
			table.integer("user_id").unsigned().notNullable();
			table.string("provider").notNullable(); // 'telegram', 'matrix', etc.
			table.string("token").notNullable(); // Encrypted token
			table.boolean("enabled").notNullable().defaultTo(true);
			table.json("config").notNullable(); // { allowed_ids: [], ... }
			table.json("meta").notNullable();
			table.foreign("user_id", foreignKeyName).references("id").inTable("user");
		});
		logger.info(`[${migrateName}] Table '${tableName}' created`);
	}

	if (!(await hasUserForeignKey(knex))) {
		await knex.schema.alterTable(tableName, (table) => {
			table.foreign("user_id", foreignKeyName).references("id").inTable("user");
		});
		logger.info(`[${migrateName}] Restored missing user foreign key`);
	}
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.dropTableIfExists(tableName);
	logger.info(`[${migrateName}] Table '${tableName}' dropped`);
};

export { down, up };
