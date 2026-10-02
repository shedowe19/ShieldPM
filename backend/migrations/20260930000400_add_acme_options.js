import { migrate as logger } from "../logger.js";

const migrateName = "add_acme_options";
const settingId = "acme-options";
const defaultServer = "https://acme-v02.api.letsencrypt.org/directory";

/** @param {string} key */
const warnInvalid = (key) => {
	logger.warn(`[${migrateName}] Legacy ${key} requires review in the ACME settings.`);
};

/**
 * Import exact legacy booleans without exposing their values in warnings.
 * @param {string} key
 * @param {boolean} fallback
 * @returns {boolean}
 */
const importBoolean = (key, fallback) => {
	const raw = process.env[key];
	if (!raw) return fallback;
	if (raw === "true") return true;
	if (raw === "false") return false;
	warnInvalid(key);
	return fallback;
};

/** @returns {number} */
const importDefaultCertificate = () => {
	const raw = process.env.DEFAULT_CERT_ID;
	if (!raw) return 0;
	const value = Number(raw);
	if (/^\d+$/.test(raw) && Number.isSafeInteger(value) && value >= 0) return value;
	warnInvalid("DEFAULT_CERT_ID");
	return 0;
};

/**
 * Import supported legacy ACME options once, encrypting EAB credentials before insertion.
 * Invalid account fields remain visible for repair without making remote requests.
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	if (await knex("setting").where({ id: settingId }).first()) return;

	const server = process.env.ACME_SERVER || defaultServer;
	const email = process.env.ACME_EMAIL || "";
	const eabKid = process.env.ACME_EAB_KID || "";
	const eabHmacKey = process.env.ACME_EAB_HMAC_KEY || "";
	try {
		const directory = new URL(server);
		if (
			!["http:", "https:"].includes(directory.protocol) ||
			!directory.hostname ||
			directory.username ||
			directory.password ||
			directory.hash ||
			/\s/.test(server)
		) {
			warnInvalid("ACME_SERVER");
		}
	} catch {
		warnInvalid("ACME_SERVER");
	}
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) warnInvalid("ACME_EMAIL");
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Detect legacy account identifiers requiring repair.
	if (/\s|[\x00-\x1f\x7f]/.test(eabKid)) warnInvalid("ACME_EAB_KID");
	if (eabHmacKey && !/^[A-Za-z0-9_-]+={0,2}$/.test(eabHmacKey)) warnInvalid("ACME_EAB_HMAC_KEY");
	if (Boolean(eabKid) !== Boolean(eabHmacKey) || ((eabKid || eabHmacKey) && !email)) {
		logger.warn(`[${migrateName}] Legacy EAB account configuration requires review in the ACME settings.`);
	}

	let encryptedEabHmacKey = "";
	if (eabHmacKey) {
		const { encrypt } = await import("../lib/encryption.js");
		encryptedEabHmacKey = encrypt(eabHmacKey);
	}
	const mustStaple = importBoolean("ACME_MUST_STAPLE", false);
	const ocspStapling = importBoolean("ACME_OCSP_STAPLING", false);
	await knex("setting")
		.insert({
			id: settingId,
			name: "ACME Options",
			description: "ACME account, certificate security and default TLS configuration",
			value: "configured",
			meta: JSON.stringify({
				server,
				email,
				account_id: "",
				eab_kid: eabKid,
				encrypted_eab_hmac_key: encryptedEabHmacKey,
				agree_tos: true,
				must_staple: mustStaple,
				ocsp_stapling: mustStaple || ocspStapling,
				server_tls_verify: importBoolean("ACME_SERVER_TLS_VERIFY", true),
				custom_ocsp_stapling: importBoolean("CUSTOM_OCSP_STAPLING", false),
				default_certificate_id: importDefaultCertificate(),
			}),
		})
		.onConflict("id")
		.ignore();
};

/**
 * Remove only the ACME options introduced by this migration.
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	await knex("setting").where({ id: settingId }).delete();
};

export { down, up };
