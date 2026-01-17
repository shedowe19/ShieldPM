/**
 * Add GitOps configuration setting
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
	await knex("setting").insert({
		id: "gitops-config",
		name: "GitOps Configuration",
		description: "Git repository synchronization settings for backup and version control",
		value: "disabled",
		meta: JSON.stringify({
			enabled: false,
			repository_url: "",
			branch: "main",
			auth_type: "https",
			encrypted_credentials: "",
			auto_push: false,
			auto_pull_on_startup: false,
			last_sync: null,
			last_error: null,
		}),
	});
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
	await knex("setting").where("id", "gitops-config").del();
}
