import { migrate as logger } from "../logger.js";

const migrateName = "terminal_security";

/** @param {import("knex").Knex} knex */
const addColumnIfMissing = async (knex, tableName, columnName, callback) => {
	if (!(await knex.schema.hasColumn(tableName, columnName))) {
		await knex.schema.alterTable(tableName, callback);
	}
};

/** @param {import("knex").Knex} knex */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	await addColumnIfMissing(knex, "proxy_host", "terminal_host_key_fingerprint", (table) => {
		table.string("terminal_host_key_fingerprint", 80).nullable();
	});
	await addColumnIfMissing(knex, "proxy_host", "terminal_gateway_secret", (table) => {
		table.text("terminal_gateway_secret").nullable();
	});
	await addColumnIfMissing(knex, "access_list", "revision", (table) => {
		table.integer("revision").notNullable().defaultTo(1);
	});
	// Existing terminal hosts predate TLS/ACL/host-key enforcement. Keep them offline until an
	// administrator explicitly supplies the new trust material through the validated update flow.
	const disabledHosts = await knex("proxy_host")
		.where("forward_scheme", "terminal")
		.where("enabled", 1)
		.where((query) =>
			query
				.whereNull("terminal_host_key_fingerprint")
				.orWhere("terminal_host_key_fingerprint", "")
				.orWhereNull("terminal_gateway_secret")
				.orWhere("terminal_gateway_secret", ""),
		)
		.update({ enabled: 0 });
	if (disabledHosts)
		logger.warn(`[${migrateName}] Disabled ${disabledHosts} legacy terminal host(s) pending revalidation`);
	logger.info(`[${migrateName}] Terminal trust and ACL revision columns added`);
};

/** @param {import("knex").Knex} knex */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	if (await knex.schema.hasColumn("proxy_host", "terminal_host_key_fingerprint")) {
		await knex.schema.alterTable("proxy_host", (table) => table.dropColumn("terminal_host_key_fingerprint"));
	}
	if (await knex.schema.hasColumn("proxy_host", "terminal_gateway_secret")) {
		await knex.schema.alterTable("proxy_host", (table) => table.dropColumn("terminal_gateway_secret"));
	}
	if (await knex.schema.hasColumn("access_list", "revision")) {
		await knex.schema.alterTable("access_list", (table) => table.dropColumn("revision"));
	}
};

export { down, up };
