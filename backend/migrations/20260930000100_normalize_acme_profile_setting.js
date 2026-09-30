import { migrate as logger } from "../logger.js";

const migrateName = "normalize_acme_profile_setting";

/**
 * Replace the obsolete inheritance state while preserving explicit profiles.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	await knex("setting").where({ id: "acme-profile" }).update({
		description:
			"Default Let's Encrypt certificate profile for new certificates and renewals without an explicit certificate profile",
	});
	await knex("setting").where({ id: "acme-profile", value: "inherit" }).update({ value: "standard" });
};

/**
 * Keep valid saved profiles when rolling back this data normalization.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const down = async (_knex) => {
	logger.warn(`[${migrateName}] Keeping normalized ACME profiles; the inheritance state is no longer supported.`);
};

export { down, up };
