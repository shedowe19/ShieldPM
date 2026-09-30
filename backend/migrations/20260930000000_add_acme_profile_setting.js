import { migrate as logger } from "../logger.js";

const migrateName = "add_acme_profile_setting";

/**
 * Add the global ACME profile without overriding the environment on upgrade.
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
				"Default Let's Encrypt certificate profile; inherit uses ACME_PROFILE until configured in ShieldPM",
			value: "inherit",
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
