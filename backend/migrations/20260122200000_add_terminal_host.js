import { onUpdateTrigger } from "../knexfile.js";

export async function up(knex) {
	await knex.schema.createTable("terminal_host", (table) => {
		table.increments("id").primary();
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();
		table.integer("owner_user_id").unsigned().notNullable().references("id").inTable("user");
		table.integer("enabled").notNullable().defaultTo(1);
		table.string("type").notNullable().defaultTo("ssh"); // ssh, telnet, etc.
		table.string("name").notNullable();
		table.string("host").notNullable();
		table.integer("port").notNullable().defaultTo(22);
		table.string("auth_type").notNullable().defaultTo("password"); // password, key
		table.string("username").notNullable();
		table.string("password"); // Encrypted
		table.string("private_key"); // Encrypted
		table.json("meta").notNullable();
		table.integer("is_deleted").notNullable().defaultTo(0);
	});

	await knex.raw(onUpdateTrigger("terminal_host"));
}

export async function down(knex) {
	await knex.schema.dropTable("terminal_host");
}
