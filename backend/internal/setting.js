import fs from "node:fs";
import errs from "../lib/error.js";
import settingModel from "../models/setting.js";
import internalAuditLog from "./audit-log.js";
import internalNginx from "./nginx.js";

const internalSetting = {
	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {String}  data.id
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
			const patch = { value: data.value, meta: data.meta };
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
	 * @return {Promise}
	 */
	get: async (access, data) => {
		await access.can("settings:get", data.id);
		const row = await settingModel.query().where("id", data.id).first();
		if (row) {
			return row;
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
	 * @param   {import("../lib/types.js").Access}  access
	 * @returns {Promise}
	 */
	getAll: async (access) => {
		await access.can("settings:list");
		return settingModel.query().orderBy("description", "ASC");
	},
};

export default internalSetting;
