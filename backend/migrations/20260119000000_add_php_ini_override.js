export const up = (knex) =>
	knex.schema.table("proxy_host", (table) => {
		table.text("php_override_ini").defaultTo(null);
	});

export const down = (knex) =>
	knex.schema.table("proxy_host", (table) => {
		table.dropColumn("php_override_ini");
	});
