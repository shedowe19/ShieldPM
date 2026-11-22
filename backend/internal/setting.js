import fs from "node:fs";
import errs from "../lib/error.js";
import { isSecretFieldName } from "../lib/host-response.js";
import settingModel from "../models/setting.js";
import internalAuditLog from "./audit-log.js";
import internalNginx from "./nginx.js";

/**
 * Secret values in a setting response are replaced by this mask. The mask is
 * also accepted on write: a client that round-trips a masked form keeps the
 * stored secret instead of replacing it with the literal asterisks.
 */
export const SECRET_MASK = "********";

const normalizeMeta = (value) => {
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
		} catch {
			return {};
		}
	}
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};

const isUnsetSecretValue = (value) => value === undefined || value === null || value === "" || value === SECRET_MASK;

const maskMeta = (value, root = true) => {
	if (Array.isArray(value)) return value.map((entry) => maskMeta(entry, false));
	if (value && typeof value === "object") {
		const result = {};
		for (const [key, entry] of Object.entries(value)) {
			if (isSecretFieldName(key) && !isUnsetSecretValue(entry)) result[key] = SECRET_MASK;
			else result[key] = maskMeta(entry, false);
			if (root && isSecretFieldName(key)) result[`${key}_configured`] = !isUnsetSecretValue(entry);
		}
		return result;
	}
	return value;
};

/**
 * Public projection of a setting row. Secret-bearing meta fields are masked and
 * accompanied by a `<field>_configured` flag; the stored value never leaves the
 * process. Used by both the settings list and the single-setting route so the
 * list can no longer expose what the detail endpoint hides.
 */
export const redactSetting = (row) => {
	if (!row) return row;
	const value = typeof row.toJSON === "function" ? row.toJSON() : { ...row };
	return { ...value, meta: maskMeta(normalizeMeta(value.meta)) };
};

export const redactSettings = (rows) => rows.map((row) => redactSetting(row));

/**
 * Keeps saved secrets when an update or GitOps import only carries a mask, a
 * blank form field, or omits the field entirely. An explicit value still wins.
 */
export const preserveMetaSecrets = (incoming, saved) => {
	if (Array.isArray(incoming)) return incoming.map((entry) => preserveMetaSecrets(entry, undefined));
	if (!incoming || typeof incoming !== "object") return incoming;
	const savedMeta = normalizeMeta(saved);
	const result = {};
	for (const [key, entry] of Object.entries(incoming)) {
		if (isSecretFieldName(key) && isUnsetSecretValue(entry)) {
			if (!isUnsetSecretValue(savedMeta[key])) result[key] = savedMeta[key];
			continue;
		}
		result[key] = entry && typeof entry === "object" ? preserveMetaSecrets(entry, savedMeta[key]) : entry;
	}
	// A redacted export may omit the secret field completely; keep the saved one.
	for (const [key, entry] of Object.entries(savedMeta)) {
		if (isSecretFieldName(key) && !(key in result) && !isUnsetSecretValue(entry)) result[key] = entry;
	}
	return result;
};

const internalSetting = {
	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {String}  data.id
	 * @param  {import("../models/setting.js").default["value"]} [data.value]
	 * @param  {import("../models/setting.js").default["meta"]} [data.meta]
	 * @return {Promise}
	 */
	update: async (access, data) => {
		await access.can("settings:update", data.id);
		const performUpdate = async () => {
			// Read inside the Nginx lock so rollback cannot restore a stale setting.
			const row = await internalSetting.get(access, { id: data.id });
			if (row.id !== data.id) {
				throw new errs.InternalValidationError(
					`Setting could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
				);
			}
			const patch = {
				...(data.value !== undefined ? { value: data.value } : {}),
				...(data.meta !== undefined ? { meta: preserveMetaSecrets(data.meta, row.meta) } : {}),
			};
			if (row.id !== "default-site") {
				await settingModel.query().where({ id: data.id }).patch(patch);
				return internalSetting.get(access, { id: data.id });
			}

			const updatedRow = { ...row, ...patch };
			const htmlPath = "/data/html/index.html";
			const changesHtml = updatedRow.value === "html";
			const previousHtml = changesHtml && fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath) : null;
			const hadConfig = fs.existsSync(internalNginx.getConfigName("default", row.id));
			await internalNginx.backupConfig("default", row);
			try {
				if (changesHtml) {
					fs.mkdirSync("/data/html", { recursive: true });
					fs.writeFileSync(htmlPath, updatedRow.meta.html, { encoding: "utf8" });
				}
				await internalNginx.generateConfig("default", updatedRow);
				await internalNginx.test();
				await settingModel.transaction(async (trx) => {
					await settingModel.query(trx).where({ id: data.id }).patch(patch);
					await internalNginx.reload();
				});
			} catch (_error) {
				// Restore files as well as the database transaction before reloading.
				if (changesHtml) {
					if (previousHtml !== null) fs.writeFileSync(htmlPath, previousHtml);
					else fs.rmSync(htmlPath, { force: true });
				}
				if (hadConfig) await internalNginx.restoreConfig("default", row);
				else await internalNginx.deleteConfig("default");
				await internalNginx.test();
				await internalNginx.reload();
				throw new errs.ValidationError(
					"Could not reconfigure Nginx. Previous configuration restored. Please check logs.",
				);
			}
			await internalNginx.deleteBackupConfig("default", row);
			return internalSetting.get(access, { id: data.id });
		};

		const updatedRow =
			data.id === "default-site"
				? await internalNginx.withConfigurationLock(performUpdate)
				: await performUpdate();

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "setting",
			object_id: 0, // Settings use string IDs, so we use 0
			meta: {
				setting_id: updatedRow.id,
				name: updatedRow.name,
				description: updatedRow.description,
				value: updatedRow.value,
			},
		});

		return updatedRow;
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   data
	 * @param  {String}   data.id
	 * @param  {Object}   [options]
	 * @param  {boolean}  [options.redactSecrets] - Mask secret meta fields (HTTP responses).
	 * @return {Promise}
	 */
	get: async (access, data, options = {}) => {
		await access.can("settings:get", data.id);
		const row = await settingModel.query().where("id", data.id).first();
		if (row) {
			return options.redactSecrets ? redactSetting(row) : row;
		}
		throw new errs.ItemNotFoundError(data.id);
	},

	/**
	 * This will only count the settings
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @returns {Promise<number>}
	 */
	getCount: async (access) => {
		await access.can("settings:list");
		const row = await settingModel.query().count("id as count").first();
		return Number.parseInt(/** @type {any} */ (row).count, 10);
	},

	/**
	 * All settings
	 *
	 * Secret values are masked by default because this list is consumed by the
	 * admin browser (and previously exposed the OIDC client secret). Internal
	 * callers that need raw metadata must opt out explicitly.
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  [options]
	 * @param   {boolean} [options.redactSecrets=true]
	 * @returns {Promise}
	 */
	getAll: async (access, options = {}) => {
		await access.can("settings:list");
		const rows = await settingModel.query().orderBy("description", "ASC");
		return options.redactSecrets === false ? rows : redactSettings(rows);
	},
};

export default internalSetting;
