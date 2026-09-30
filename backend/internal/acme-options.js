import errs from "../lib/error.js";
import settingModel from "../models/setting.js";
import { acmeOptionFields, publicAcmeOptions } from "./acme-options-public.js";
import { withAcmeSettingsLock } from "./acme-settings-lock.js";
import internalAuditLog from "./audit-log.js";

const id = "acme-options";
const booleanFields = ["agree_tos", "must_staple", "ocsp_stapling", "server_tls_verify", "custom_ocsp_stapling"];
const hasControlCharacters = (value) =>
	[...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const tlsFields = ["ocsp_stapling", "custom_ocsp_stapling", "default_certificate_id"];

/** @typedef {{server:string,email:string,account_id:string,eab_kid:string,agree_tos:boolean,must_staple:boolean,ocsp_stapling:boolean,server_tls_verify:boolean,custom_ocsp_stapling:boolean,default_certificate_id:number,encrypted_eab_hmac_key:string}} AcmePolicy */
/** @typedef {Omit<AcmePolicy,"encrypted_eab_hmac_key"> & {eab_hmac_key_set:boolean}} PublicAcmePolicy */
/** @typedef {Omit<AcmePolicy,"encrypted_eab_hmac_key"> & {eab_hmac_key?:string|null}} AcmeUpdate */

/** @param {unknown} data @returns {AcmeUpdate} */
const validateUpdate = (data) => {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		throw new errs.ValidationError("ACME options must be an object");
	}
	const policy = /** @type {AcmeUpdate} */ (data);
	if (
		acmeOptionFields.some((field) => !Object.hasOwn(policy, field)) ||
		Object.keys(policy).some((field) => !acmeOptionFields.includes(field) && field !== "eab_hmac_key") ||
		booleanFields.some((field) => typeof policy[field] !== "boolean") ||
		!Number.isSafeInteger(policy.default_certificate_id) ||
		policy.default_certificate_id < 0 ||
		typeof policy.server !== "string" ||
		typeof policy.email !== "string" ||
		typeof policy.account_id !== "string" ||
		typeof policy.eab_kid !== "string"
	) {
		throw new errs.ValidationError("ACME options contain missing or invalid fields");
	}
	let server;
	try {
		server = new URL(policy.server);
	} catch {
		throw new errs.ValidationError("The ACME server must be an HTTP or HTTPS directory URL");
	}
	if (
		!["https:", "http:"].includes(server.protocol) ||
		!server.hostname ||
		server.username ||
		server.password ||
		server.hash ||
		/\s/.test(policy.server) ||
		hasControlCharacters(policy.server)
	) {
		throw new errs.ValidationError("The ACME server must be an HTTP or HTTPS directory URL without credentials");
	}
	if (hasControlCharacters(policy.email) || (policy.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(policy.email))) {
		throw new errs.ValidationError("The ACME account email is invalid");
	}
	if (!/^[A-Za-z0-9_-]{0,128}$/.test(policy.account_id)) {
		throw new errs.ValidationError("The ACME account identifier is invalid");
	}
	if (
		/\s/.test(policy.eab_kid) ||
		hasControlCharacters(policy.eab_kid) ||
		["[", "]", '"', "'", "#", ";"].some((character) => policy.eab_kid.includes(character))
	) {
		throw new errs.ValidationError("The EAB key identifier must not contain whitespace or control characters");
	}
	if (
		Object.hasOwn(policy, "eab_hmac_key") &&
		policy.eab_hmac_key !== null &&
		(typeof policy.eab_hmac_key !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(policy.eab_hmac_key))
	) {
		throw new errs.ValidationError("The EAB HMAC key must be a nonempty base64url key, or null to clear it");
	}
	if (policy.must_staple && !policy.ocsp_stapling) {
		throw new errs.ValidationError("Must-Staple requires ACME OCSP stapling");
	}
	if (policy.must_staple && /^acme(?:-staging)?-v02\.api\.letsencrypt\.org$/i.test(server.hostname)) {
		throw new errs.ValidationError("Let's Encrypt no longer supports Must-Staple certificates");
	}
	return { ...policy };
};

/** @param {any} [trx] @returns {Promise<AcmePolicy>} Keep legacy account values readable so administrators can repair them. */
const readSavedPolicy = async (trx) => {
	const row = await settingModel.query(trx).where("id", id).first();
	if (!row) throw new errs.ConfigurationError("The saved ACME options are missing");
	const meta = row.meta;
	if (
		row.value !== "configured" ||
		!meta ||
		typeof meta !== "object" ||
		Array.isArray(meta) ||
		["server", "email", "account_id", "eab_kid", "encrypted_eab_hmac_key"].some(
			(field) => typeof meta[field] !== "string",
		) ||
		booleanFields.some((field) => typeof meta[field] !== "boolean") ||
		!Number.isSafeInteger(meta.default_certificate_id) ||
		meta.default_certificate_id < 0
	) {
		throw new errs.ConfigurationError("The saved ACME options are invalid");
	}
	return /** @type {AcmePolicy} */ ({
		...Object.fromEntries(acmeOptionFields.map((field) => [field, meta[field]])),
		encrypted_eab_hmac_key: meta.encrypted_eab_hmac_key,
	});
};

/** @param {AcmePolicy} policy @returns {Promise<AcmeUpdate & {eab_hmac_key:string}>} */
const runtimePolicy = async (policy) => {
	let key = "";
	try {
		if (policy.encrypted_eab_hmac_key) {
			const { decrypt } = await import("../lib/encryption.js");
			key = decrypt(policy.encrypted_eab_hmac_key);
		}
		const fields = Object.fromEntries(acmeOptionFields.map((field) => [field, policy[field]]));
		validateUpdate({ ...fields, ...(key ? { eab_hmac_key: key } : {}) });
		if (Boolean(policy.eab_kid) !== Boolean(key) || (key && !policy.email)) throw new Error("Invalid EAB pair");
		return /** @type {AcmeUpdate & {eab_hmac_key:string}} */ ({ ...fields, eab_hmac_key: key });
	} catch {
		throw new errs.ConfigurationError("The saved ACME account options are invalid. Repair them in Settings.");
	}
};

const internalAcmeOptions = {
	/** @returns {Promise<AcmePolicy>} */
	getPolicy: async () => {
		const policy = await readSavedPolicy();
		await runtimePolicy(policy);
		return policy;
	},
	/** @returns {Promise<AcmeUpdate & {eab_hmac_key:string}>} */
	getRuntimePolicy: async () => runtimePolicy(await readSavedPolicy()),
	/** @param {any} [trx] @returns {Promise<PublicAcmePolicy>} */
	getPublicPolicy: async (trx) => /** @type {PublicAcmePolicy} */ (publicAcmeOptions(await readSavedPolicy(trx))),
	/** @param {import("../lib/types.js").Access} access @returns {Promise<PublicAcmePolicy>} */
	get: async (access) => {
		await access.can("settings:get", id);
		return internalAcmeOptions.getPublicPolicy();
	},
	/** @param {import("../lib/types.js").Access} access @param {unknown} data @returns {Promise<PublicAcmePolicy>} */
	update: async (access, data) => {
		await access.can("settings:update", id);
		const request = validateUpdate(data);
		return withAcmeSettingsLock(async () => {
			const previous = await readSavedPolicy();
			if (
				previous.encrypted_eab_hmac_key &&
				(request.server !== previous.server || request.eab_kid !== previous.eab_kid) &&
				!Object.hasOwn(request, "eab_hmac_key")
			) {
				throw new errs.ValidationError(
					"Changing the ACME server or EAB identifier requires replacing or clearing the EAB key",
				);
			}
			let encryptedKey = previous.encrypted_eab_hmac_key;
			if (Object.hasOwn(request, "eab_hmac_key")) {
				if (request.eab_hmac_key === null) encryptedKey = "";
				else {
					const { encrypt } = await import("../lib/encryption.js");
					encryptedKey = encrypt(request.eab_hmac_key);
				}
			}
			const policy = /** @type {AcmePolicy} */ ({
				...Object.fromEntries(acmeOptionFields.map((field) => [field, request[field]])),
				encrypted_eab_hmac_key: encryptedKey,
			});
			if (Boolean(policy.eab_kid) !== Boolean(encryptedKey) || (encryptedKey && !policy.email)) {
				throw new errs.ValidationError("EAB requires a key identifier, HMAC key and account email together");
			}
			await runtimePolicy(policy);
			const { default: profile } = await import("./acme-profile.js");
			await profile.validatePolicyForServer(policy.server, policy.server_tls_verify, await profile.getPolicy());
			const persist = async (trx) => {
				const affected = await settingModel
					.query(trx)
					.where("id", id)
					.patch({ value: "configured", meta: policy });
				if (!affected) throw new errs.ItemNotFoundError(id);
			};
			if (tlsFields.some((field) => policy[field] !== previous[field])) {
				const { default: tls } = await import("./acme-tls.js");
				await tls.applyPolicy(publicAcmeOptions(policy), persist);
			} else await persist(undefined);
			const saved = /** @type {PublicAcmePolicy} */ (publicAcmeOptions(policy));
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "setting",
				object_id: 0,
				meta: { setting_id: id, name: "ACME Options", value: "configured", ...saved },
			});
			return saved;
		});
	},
};

export default internalAcmeOptions;
