export const up = (knex) =>
	knex.schema.table("proxy_host", (table) => {
		table.integer("anubis_enabled").notNull().defaultTo(0);
	});

export const down = (knex) =>
	knex.schema.table("proxy_host", (table) => {
		table.dropColumn("anubis_enabled");
	});
