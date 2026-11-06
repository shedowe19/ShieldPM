/**
 * Add DDNS Provider table
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
	await knex.schema.createTable("ddns_provider", (table) => {
		table.increments("id").primary();
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();
		table.integer("owner_user_id").unsigned().notNullable().references("id").inTable("user");
		table.string("name").notNullable();
		table.string("provider").notNullable(); // cloudflare, duckdns, etc.
		table.json("domains").notNullable(); // ["sub.example.com", ...]
		table.json("config").notNullable(); // { token: "..." }
		table.string("last_ipv4").nullable();
		table.string("last_ipv6").nullable();
		table.dateTime("last_updated_on").nullable();
		table.string("last_error").nullable();
		table.integer("enabled").notNullable().defaultTo(1);
		// MySQL requires non-NULL JSON defaults to be expressions, including literals.
		const mysql = ["mysql", "mysql2"].includes(knex.client.config.client);
		table
			.json("meta")
			.notNullable()
			.defaultTo(mysql ? {} : "{}");
	});
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
	await knex.schema.dropTable("ddns_provider");
}
