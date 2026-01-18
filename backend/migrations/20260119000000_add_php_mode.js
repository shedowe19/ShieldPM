/**
 * Add PHP hosting support to proxy_host table
 */
export async function up(knex) {
	await knex.schema.alterTable("proxy_host", (table) => {
		table.boolean("php_enabled").notNullable().defaultTo(false);
		table.string("php_version", 10).notNullable().defaultTo("83");
	});
}

export async function down(knex) {
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("php_enabled");
		table.dropColumn("php_version");
	});
}
