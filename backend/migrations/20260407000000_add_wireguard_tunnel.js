import { migrate as logger } from "../logger.js";

const migrateName = "add_wireguard_tunnel";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("wireguard_peer", (table) => {
			table.increments("id").primary();
			table.dateTime("created_on").notNullable();
			table.dateTime("modified_on").notNullable();
			table.integer("owner_user_id").notNullable().unsigned();
			table.integer("is_deleted").notNullable().unsigned().defaultTo(0);
			table.string("name").notNullable();
			table.text("description").nullable();
			table.string("client_address").notNullable();
			table.text("client_public_key").notNullable();
			table.text("client_private_key").notNullable();
			table.text("preshared_key").notNullable();
			table.string("server_public_key").notNullable();
			table.string("endpoint").nullable();
			table.string("allowed_ips").notNullable().defaultTo("10.8.0.0/24");
			table.integer("persistent_keepalive").notNullable().defaultTo(25);
			table.string("dns").nullable().defaultTo("1.1.1.1");
			table.integer("status").notNullable().defaultTo(0);
			table.dateTime("last_handshake").nullable();
			table.bigInteger("transfer_rx").notNullable().defaultTo(0);
			table.bigInteger("transfer_tx").notNullable().defaultTo(0);
			table.json("meta").notNullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] wireguard_peer Table created`);
		})
		.then(() => {
			return knex("setting").insert({
				id: "wireguard-config",
				name: "WireGuard Configuration",
				description: "WireGuard tunnel server settings",
				value: "disabled",
				meta: JSON.stringify({
					endpoint: "",
					listen_port: 51820,
					subnet: "10.8.0.0/24",
					server_address: "10.8.0.1/24",
				}),
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] wireguard-config setting created`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTable("wireguard_peer").then(() => {
		return knex("setting").where("id", "wireguard-config").del();
	});
};

export { down, up };
