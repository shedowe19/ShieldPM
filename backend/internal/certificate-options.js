import errs from "../lib/error.js";
import settingModel from "../models/setting.js";
import internalAuditLog from "./audit-log.js";

const settingId = "certificate-options";
let policyUpdates = Promise.resolve();

/** @template T @param {() => Promise<T>} operation @returns {Promise<T>} */
const withPolicyLock = (operation) => {
	const result = policyUpdates.then(operation);
	policyUpdates = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
};

/** @typedef {{key_type: "ecdsa"|"rsa", renewal_interval_hours: number}} CertificateOptions */

/** @param {CertificateOptions} data @returns {CertificateOptions} */
const validatePolicy = (data) => {
	if (
		!data ||
		typeof data !== "object" ||
		Array.isArray(data) ||
		Object.keys(data).length !== 2 ||
		!Object.hasOwn(data, "key_type") ||
		!Object.hasOwn(data, "renewal_interval_hours") ||
		(data.key_type !== "ecdsa" && data.key_type !== "rsa") ||
		!Number.isInteger(data.renewal_interval_hours) ||
		data.renewal_interval_hours < 1 ||
		data.renewal_interval_hours > 12
	) {
		throw new errs.ValidationError(
			"Certificate options require ecdsa or rsa and a renewal interval from 1 to 12 hours",
		);
	}
	return { key_type: data.key_type, renewal_interval_hours: data.renewal_interval_hours };
};

/** @param {CertificateOptions} policy @returns {Promise<void>} */
const applyPolicyUnlocked = async (policy) => {
	const { default: certificate } = await import("./certificate.js");
	certificate.rescheduleTimer(policy.renewal_interval_hours);
};

const internalCertificateOptions = {
	/** @returns {Promise<CertificateOptions>} Saved options for issuance and renewal. */
	getPolicy: async () => {
		const row = await settingModel.query().where("id", settingId).first();
		if (!row) return { key_type: "ecdsa", renewal_interval_hours: 12 };
		try {
			if (row.value !== "configured") throw new errs.ValidationError("Invalid certificate options state");
			return validatePolicy(/** @type {CertificateOptions} */ (row.meta));
		} catch {
			throw new errs.ConfigurationError("The saved certificate options are invalid");
		}
	},

	/** @param {import("../lib/types.js").Access} access @returns {Promise<CertificateOptions>} */
	get: async (access) => {
		await access.can("settings:get", settingId);
		return internalCertificateOptions.getPolicy();
	},

	/** Replace the timer without triggering an additional renewal or cleanup.
	 * @param {CertificateOptions} data
	 * @returns {Promise<void>}
	 */
	applyPolicy: async (data) => {
		const policy = validatePolicy(data);
		await withPolicyLock(() => applyPolicyUnlocked(policy));
	},

	/**
	 * Save certificate options and immediately replace the renewal timer.
	 * @param {import("../lib/types.js").Access} access
	 * @param {CertificateOptions} data
	 * @returns {Promise<CertificateOptions>}
	 */
	update: async (access, data) => {
		await access.can("settings:update", settingId);
		const policy = validatePolicy(data);
		return withPolicyLock(async () => {
			const affected = await settingModel
				.query()
				.where("id", settingId)
				.patch({ value: "configured", meta: policy });
			if (!affected) throw new errs.ItemNotFoundError(settingId);
			await applyPolicyUnlocked(policy);
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "setting",
				object_id: 0,
				meta: { setting_id: settingId, name: "Certificate Options", value: "configured", ...policy },
			});
			return policy;
		});
	},
};

export default internalCertificateOptions;
