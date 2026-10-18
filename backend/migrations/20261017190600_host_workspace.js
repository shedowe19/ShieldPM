/** Personal saved views/profiles and host-scoped tags, separate from proxy runtime metadata. */
export const up = async (knex) => {
	await knex.schema.createTable("host_workspace_item", (table) => {
		table.increments("id").primary();
		table.integer("owner_user_id").unsigned().notNullable().index();
		table.string("kind", 12).notNullable();
		table.string("name", 80).notNullable();
		table.text("definition").notNullable();
		table.string("created_on").notNullable();
		table.string("modified_on").notNullable();
		table.unique(["owner_user_id", "kind", "name"]);
	});
	await knex.schema.createTable("proxy_host_tag", (table) => {
		table.increments("id").primary();
		table.integer("host_id").unsigned().notNullable().index();
		table.string("tag", 32).notNullable().index();
		table.string("created_on").notNullable();
		table.unique(["host_id", "tag"]);
	});
};
export const down = async (knex) => {
	await knex.schema.dropTableIfExists("proxy_host_tag");
	await knex.schema.dropTableIfExists("host_workspace_item");
};
