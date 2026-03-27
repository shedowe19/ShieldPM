import { migrate as logger } from "../logger.js";

const migrateName = "add_rdp_to_proxy_host";

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

	// Add RDP columns to proxy_host
	await knex.schema.alterTable("proxy_host", (table) => {
		table.string("rdp_host").nullable();
		table.integer("rdp_port").nullable().defaultTo(3389);
		table.string("rdp_username").nullable();
		table.string("rdp_domain").nullable(); // Windows domain (optional)
		table.text("rdp_password").nullable(); // Encrypted
		table.integer("rdp_width").nullable().defaultTo(1280);
		table.integer("rdp_height").nullable().defaultTo(800);
		table.integer("rdp_ignore_cert").nullable().defaultTo(1); // Ignore self-signed certs by default
	});

	logger.info(`[${migrateName}] Added RDP columns to proxy_host`);
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	await knex.schema.alterTable("proxy_host", (table) => {
		table.dropColumn("rdp_host");
		table.dropColumn("rdp_port");
		table.dropColumn("rdp_username");
		table.dropColumn("rdp_domain");
		table.dropColumn("rdp_password");
		table.dropColumn("rdp_width");
		table.dropColumn("rdp_height");
		table.dropColumn("rdp_ignore_cert");
	});

	logger.info(`[${migrateName}] Reverted RDP migration`);
};

export { up, down };
