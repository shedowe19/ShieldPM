import errs from "../lib/error.js";
import settingModel from "../models/setting.js";
import internalAuditLog from "./audit-log.js";

/**
 * Database options applied by their consumers on the next operation.
 * @template {object} T
 * @param {string} id
 * @param {string} name
 * @param {(data: unknown) => T} validate
 */
export const createApplicationOptions = (id, name, validate) => {
	let updates = Promise.resolve();
	const service = {
		/** @param {import("knex").Knex.Transaction} [trx] @returns {Promise<T>} */
		getPolicy: async (trx) => {
			const row = await settingModel.query(trx).where("id", id).first();
			if (!row) throw new errs.ConfigurationError(`The saved ${name.toLowerCase()} are missing`);
			try {
				if (row.value !== "configured") throw new errs.ValidationError("Invalid options state");
				return validate(row.meta);
			} catch {
				throw new errs.ConfigurationError(`The saved ${name.toLowerCase()} are invalid`);
			}
		},

		/** @param {import("../lib/types.js").Access} access @returns {Promise<T>} */
		get: async (access) => {
			await access.can("settings:get", id);
			return service.getPolicy();
		},

		/**
		 * Save a policy without invoking cleanup, rewriting configurations or reloading Nginx.
		 * @param {import("../lib/types.js").Access} access
		 * @param {T} data
		 * @returns {Promise<T>}
		 */
		update: async (access, data) => {
			await access.can("settings:update", id);
			const policy = validate(data);
			const operation = updates.then(async () => {
				const affected = await settingModel
					.query()
					.where("id", id)
					.patch({ value: "configured", meta: policy });
				if (!affected) throw new errs.ItemNotFoundError(id);
				await internalAuditLog.add(access, {
					action: "updated",
					object_type: "setting",
					object_id: 0,
					meta: { setting_id: id, name, value: "configured", ...policy },
				});
				return policy;
			});
			updates = operation.then(
				() => undefined,
				() => undefined,
			);
			return operation;
		},
	};
	return service;
};
