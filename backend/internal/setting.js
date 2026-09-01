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
	 * @param  {any}     data.value
	 * @param  {Object}  data.meta
	 * @return {Promise}
	 */
	update: async (access, data) => {
		await access.can("settings:update", data.id);
		const row = await internalSetting.get(access, { id: data.id });

		if (row.id !== data.id) {
			// Sanity check that something crazy hasn't happened
			throw new errs.InternalValidationError(
				`Setting could not be updated, IDs do not match: ${row.id} !== ${data.id}`,
			);
		}

		await settingModel.query().where({ id: data.id }).patch({
			value: data.value,
			meta: data.meta,
		});
		const updatedRow = await internalSetting.get(access, {
			id: data.id,
		});

		if (updatedRow.id === "default-site") {
			// write the html if we need to
			if (updatedRow.value === "html") {
				fs.writeFileSync("/data/html/index.html", updatedRow.meta.html, { encoding: "utf8" });
			}

			// Configure nginx
			try {
				await internalNginx.deleteConfig("default");
				await internalNginx.generateConfig("default", updatedRow);
				await internalNginx.test();
				await internalNginx.reload();
			} catch (_err) {
				await internalNginx.deleteConfig("default");
				await internalNginx.test();
				await internalNginx.reload();
				// I'm being slack here I know..
				throw new errs.ValidationError("Could not reconfigure Nginx. Please check logs.");
			}
		}

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
