import { migrate as logger } from "../logger.js";

const migrateName = "add_application_options";

/**
 * Import legacy environment options once without replacing saved settings.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	const renewalHours = Number(process.env.CRT);
	const refreshMultiplier = Number(process.env.IPRT);
	const validRenewalHours = Number.isInteger(renewalHours) && renewalHours >= 1 && renewalHours <= 596;
	const validRefreshMultiplier =
		Number.isInteger(refreshMultiplier) && refreshMultiplier >= 1 && refreshMultiplier <= 99;
	await knex("setting")
		.insert([
			{
				id: "certificate-options",
				name: "Certificate Options",
				description: "Key type and interval between certificate renewal checks",
				value: "configured",
				meta: JSON.stringify({
					key_type: ["rsa", "ecdsa"].includes(process.env.ACME_KEY_TYPE)
						? process.env.ACME_KEY_TYPE
						: "ecdsa",
					renewal_interval_hours: Math.min(validRenewalHours ? renewalHours : 12, 12),
				}),
			},
			{
				id: "ip-ranges-options",
				name: "IP Range Options",
				description: "Automatic Cloudflare IP range updates and refresh interval",
				value: "configured",
				meta: JSON.stringify({
					enabled: process.env.SKIP_IP_RANGES === "false",
					refresh_interval_hours: (validRefreshMultiplier ? refreshMultiplier : 1) * 6,
				}),
			},
		])
		.onConflict("id")
		.ignore();
};

/**
 * Remove only the application options introduced by this migration.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex("setting").whereIn("id", ["certificate-options", "ip-ranges-options"]).delete();
};

export { down, up };
