import { migrate as logger } from "../logger.js";

const migrateName = "add_acme_profile_setting";

/**
 * Add the global ACME profile with Standard as the initial setting.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	await knex("setting")
		.insert({
			id: "acme-profile",
			name: "ACME Certificate Profile",
			description:
				"Default Let's Encrypt certificate profile for new certificates and renewals without an explicit certificate profile",
			value: "standard",
			meta: JSON.stringify({}),
		})
		.onConflict("id")
		.ignore();
};

/**
 * Remove only the global ACME profile setting.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex("setting").where({ id: "acme-profile" }).delete();
};

export { down, up };
