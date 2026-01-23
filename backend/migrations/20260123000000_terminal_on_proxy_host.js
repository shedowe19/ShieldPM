import { migrate as logger } from "../logger.js";

const migrateName = "terminal_on_proxy_host";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// Add terminal columns to proxy_host
	await knex.schema.alterTable("proxy_host", (table) => {
		table.string("terminal_host").nullable();
		table.integer("terminal_port").nullable().defaultTo(22);
		table.string("terminal_username").nullable();
		table.string("terminal_auth_type").nullable().defaultTo("password"); // password, key
		table.text("terminal_password").nullable(); // Encrypted
		table.text("terminal_private_key").nullable(); // Encrypted
	});

	logger.info(`[${migrateName}] Added terminal columns to proxy_host`);

	// Migrate existing terminal_host entries to proxy_host
	const hasTerminalHostTable = await knex.schema.hasTable("terminal_host");
	if (hasTerminalHostTable) {
		const terminalHosts = await knex("terminal_host").where("is_deleted", 0);

		for (const th of terminalHosts) {
			await knex("proxy_host").insert({
				created_on: th.created_on,
				modified_on: th.modified_on,
				owner_user_id: th.owner_user_id,
				enabled: th.enabled,
				forward_scheme: "terminal",
				forward_host: th.host,
				forward_port: th.port,
				domain_names: JSON.stringify([`terminal-${th.id}.local`]), // Placeholder domain
				meta: JSON.stringify({ migrated_from_terminal_host: th.id, original_name: th.name }),
				locations: JSON.stringify([]),
				terminal_host: th.host,
				terminal_port: th.port,
				terminal_username: th.username,
				terminal_auth_type: th.auth_type,
				terminal_password: th.password,
				terminal_private_key: th.private_key,
				// Defaults for other fields
				ssl_forced: 0,
				caching_enabled: 0,
				block_exploits: 0,
				allow_websocket_upgrade: 1,
				http2_support: 0,
				hsts_enabled: 0,
				hsts_subdomains: 0,
				maintenance_on_failure: 0,
				disable_buffering: 1,
				maintenance_active: 0,
				php_enabled: 0,
				git_sync_enabled: 0,
				advanced_config: "",
				is_deleted: 0,
			});
		}

		logger.info(`[${migrateName}] Migrated ${terminalHosts.length} terminal_host entries to proxy_host`);

		// Drop the old terminal_host table
		await knex.schema.dropTable("terminal_host");
		logger.info(`[${migrateName}] Dropped terminal_host table`);
	}
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	// Recreate terminal_host table
	await knex.schema.createTable("terminal_host", (table) => {
		table.increments("id").primary();
		table.dateTime("created_on").notNullable();
		table.dateTime("modified_on").notNullable();
		table.integer("owner_user_id").unsigned().notNullable().references("id").inTable("user");
		table.integer("enabled").notNullable().defaultTo(1);
		table.string("type").notNullable().defaultTo("ssh");
		table.string("name").notNullable();
		table.string("host").notNullable();
		table.integer("port").notNullable().defaultTo(22);
		table.string("auth_type").notNullable().defaultTo("password");
		table.string("username").notNullable();
		table.string("password");
		table.string("private_key");
		table.json("meta").notNullable();
		table.integer("is_deleted").notNullable().defaultTo(0);
	});

	// Migrate back from proxy_host (best effort)
	const terminalProxyHosts = await knex("proxy_host").where("forward_scheme", "terminal").where("is_deleted", 0);

	for (const ph of terminalProxyHosts) {
		const meta = typeof ph.meta === "string" ? JSON.parse(ph.meta) : ph.meta;
		await knex("terminal_host").insert({
			created_on: ph.created_on,
			modified_on: ph.modified_on,
			owner_user_id: ph.owner_user_id,
			enabled: ph.enabled,
			type: "ssh",
			name: meta?.original_name || `Terminal ${ph.id}`,
			host: ph.terminal_host,
			port: ph.terminal_port || 22,
			auth_type: ph.terminal_auth_type || "password",
			username: ph.terminal_username || "root",
			password: ph.terminal_password,
			private_key: ph.terminal_private_key,
			meta: JSON.stringify({}),
			is_deleted: 0,
		});
	}

	// Remove terminal columns from proxy_host
	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("terminal_host");
		table.dropColumn("terminal_port");
		table.dropColumn("terminal_username");
		table.dropColumn("terminal_auth_type");
		table.dropColumn("terminal_password");
		table.dropColumn("terminal_private_key");
	});

	logger.info(`[${migrateName}] Reverted migration`);
};

export { up, down };
