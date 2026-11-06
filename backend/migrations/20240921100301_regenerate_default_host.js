import { migrate as logger } from "../logger.js";

const migrateName = "regenerate_default_host";

async function regenerateDefaultHost(knex) {
	// A detached target schema must not import models bound to the active database.
	// Normal setup regenerates this configuration after target activation.
	if (knex.client.config.shieldpmBootstrapSchema) return;
	const row = await knex("setting").select("*").where("id", "default-site").first();

	if (!row) {
		return Promise.resolve();
	}
	const { default: internalNginx } = await import("../internal/nginx.js");

	return internalNginx
		.deleteConfig("default")
		.then(() => {
			return internalNginx.generateConfig("default", row);
		})
		.then(() => {
			return internalNginx.test();
		})
		.then(() => {
			return internalNginx.reload();
		});
}

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return regenerateDefaultHost(knex);
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);

	return regenerateDefaultHost(knex);
};

export { down, up };
