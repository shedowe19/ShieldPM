import errs from "../lib/error.js";
import settingModel from "../models/setting.js";
import internalAuditLog from "./audit-log.js";
import internalIpRanges from "./ip_ranges.js";

const settingId = "ip-ranges-options";
let updateQueue = Promise.resolve();

/**
 * @param {unknown} data
 * @param {boolean} [stored]
 * @returns {{enabled: boolean, refresh_interval_hours: number}}
 */
const validateOptions = (data, stored = false) => {
	const options = /** @type {{enabled?: unknown, refresh_interval_hours?: unknown}} */ (data);
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).some((key) => key !== "enabled" && key !== "refresh_interval_hours") ||
		typeof options.enabled !== "boolean" ||
		typeof options.refresh_interval_hours !== "number" ||
		!Number.isInteger(options.refresh_interval_hours) ||
		options.refresh_interval_hours < 6 ||
		options.refresh_interval_hours > 594 ||
		options.refresh_interval_hours % 6 !== 0
	) {
		const message =
			"IP range options require an enabled boolean and a refresh interval of 6 to 594 hours in steps of 6";
		throw stored ? new errs.ConfigurationError(message) : new errs.ValidationError(message);
	}
	return { enabled: options.enabled, refresh_interval_hours: options.refresh_interval_hours };
};

const internalIpRangesOptions = {
	/** @returns {Promise<{enabled: boolean, refresh_interval_hours: number}>} */
	getPolicy: async () => {
		const row = await settingModel.query().where("id", settingId).first();
		if (!row) return { enabled: false, refresh_interval_hours: 6 };
		if (row.value !== "configured") {
			throw new errs.ConfigurationError("The saved IP range options are invalid");
		}
		return validateOptions(row.meta, true);
	},

	/**
	 * @param {import("../lib/types.js").Access} access
	 * @returns {Promise<{enabled: boolean, refresh_interval_hours: number}>}
	 */
	get: async (access) => {
		await access.can("settings:get", settingId);
		return internalIpRangesOptions.getPolicy();
	},

	/**
	 * Persist and immediately apply administrator-controlled automatic IP range refresh settings.
	 * @param {import("../lib/types.js").Access} access
	 * @param {{enabled: boolean, refresh_interval_hours: number}} data
	 * @returns {Promise<{enabled: boolean, refresh_interval_hours: number}>}
	 */
	update: async (access, data) => {
		await access.can("settings:update", settingId);
		const options = validateOptions(data);
		const operation = updateQueue.then(async () => {
			const affected = await settingModel
				.query()
				.where("id", settingId)
				.patch({ value: "configured", meta: options });
			if (!affected) throw new errs.ItemNotFoundError(settingId);
			await internalIpRanges.configure(options);
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "setting",
				object_id: 0,
				meta: { setting_id: settingId, name: "IP Range Options", value: options },
			});
			return options;
		});
		updateQueue = operation.then(
			() => {},
			() => {},
		);
		return operation;
	},
};

export default internalIpRangesOptions;
