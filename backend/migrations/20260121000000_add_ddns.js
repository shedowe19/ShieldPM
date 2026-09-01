const tableName = "ddns_provider";
const foreignKeyName = "ddns_provider_owner_user_id_foreign";
const requiredColumns = [
	"id",
	"created_on",
	"modified_on",
	"owner_user_id",
	"name",
	"provider",
	"domains",
	"config",
	"last_ipv4",
	"last_ipv6",
	"last_updated_on",
	"last_error",
	"enabled",
	"meta",
];

const resultRows = (result) => {
	const rows = result?.rows ?? (Array.isArray(result?.[0]) ? result[0] : result);
	return Array.isArray(rows) ? rows : [];
};

const hasOwnerForeignKey = async (knex) => {
	const client = String(knex.client.config.client);
	if (client.includes("sqlite")) {
		const rows = resultRows(await knex.raw('PRAGMA foreign_key_list("ddns_provider")'));
		return rows.some((row) => row.from === "owner_user_id" && row.table === "user" && row.to === "id");
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
 * @param {import("knex").Knex.CreateTableBuilder} table
 */
export function defineTable(table) {
	table.increments("id").primary();
	table.dateTime("created_on").notNullable();
	table.dateTime("modified_on").notNullable();
	table.integer("owner_user_id").unsigned().notNullable();
	table.string("name").notNullable();
	table.string("provider").notNullable(); // cloudflare, duckdns, etc.
	table.json("domains").notNullable(); // ["sub.example.com", ...]
	table.json("config").notNullable(); // { token: "..." }
	table.string("last_ipv4").nullable();
	table.string("last_ipv6").nullable();
	table.dateTime("last_updated_on").nullable();
	table.string("last_error").nullable();
	table.integer("enabled").notNullable().defaultTo(1);
	// JSON defaults are not portable (MySQL requires an expression). The model
	// always supplies an explicit object while the database enforces NOT NULL.
	table.json("meta").notNullable();
	table.foreign("owner_user_id", foreignKeyName).references("id").inTable("user");
}

/**
 * Add DDNS Provider table
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
	if (await knex.schema.hasTable(tableName)) await assertExpectedColumns(knex);
	else await knex.schema.createTable(tableName, defineTable);

	if (!(await hasOwnerForeignKey(knex))) {
		await knex.schema.alterTable(tableName, (table) => {
			table.foreign("owner_user_id", foreignKeyName).references("id").inTable("user");
		});
	}
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
	await knex.schema.dropTableIfExists(tableName);
}
