/**
 * Add Git Sync fields to proxy_host table
 * For automatic website deployment from Git repositories
 */

/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
	await knex.schema.alterTable("proxy_host", (table) => {
		// Repository configuration
		table.string("git_repo_url").nullable().defaultTo(null);
		table.string("git_branch").notNullable().defaultTo("main");
		table.boolean("git_sync_enabled").notNullable().defaultTo(false);

		// Polling configuration (value + unit)
		table.integer("git_poll_interval").notNullable().defaultTo(60);
		table.string("git_poll_unit", 1).notNullable().defaultTo("m"); // s, m, h

		// Encrypted credentials (PAT)
		table.text("git_credentials").nullable().defaultTo(null);

		// Status tracking
		table.dateTime("git_last_sync").nullable().defaultTo(null);
		table.string("git_last_commit").nullable().defaultTo(null);
		table.text("git_last_error").nullable().defaultTo(null);
	});
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("git_repo_url");
		table.dropColumn("git_branch");
		table.dropColumn("git_sync_enabled");
		table.dropColumn("git_poll_interval");
		table.dropColumn("git_poll_unit");
		table.dropColumn("git_credentials");
		table.dropColumn("git_last_sync");
		table.dropColumn("git_last_commit");
		table.dropColumn("git_last_error");
	});
}
