import fs from "node:fs";
import path from "node:path";
import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { wasm_module as logger } from "../logger.js";
import proxyHostModel from "../models/proxy_host.js";
import wasmModuleModel from "../models/wasm_module.js";
import internalAuditLog from "./audit-log.js";
import internalGitOps from "./gitops.js";
import internalNginx from "./nginx.js";

const omissions = () => {
	return ["is_deleted"];
};

const internalWasmModule = {
	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {string}  data.name
	 * @param   {string}  [data.description]
	 * @param   {string}  data.file_name
	 * @param   {Buffer}  data.file_content
	 * @param   {Object}  [data.meta]
	 * @returns {Promise<Object>}
	 */
	create: async (access, data) => {
		await access.can("wasm_modules:create", data);
		
		const row = await wasmModuleModel.query().insertAndFetch(
			/** @type {any} */ ({
				name: data.name,
				description: data.description || null,
				file_name: data.file_name,
				meta: data.meta || {},
				owner_user_id: access.token.getUserId(1),
			}),
		);

		const omittedRow = utils.omitRow(omissions())(row);

		// Write the WASM file to disk
		const wasmDir = "/data/wasm";
		try {
			await fs.promises.mkdir(wasmDir, { recursive: true });
			await fs.promises.writeFile(path.join(wasmDir, `${omittedRow.id}.wasm`), data.file_content);
		} catch (err) {
			// Clean up row if file write fails
			await wasmModuleModel.query().deleteById(omittedRow.id);
			logger.error(`Failed to write WASM file for module ${omittedRow.id}`, err);
			throw new errs.InternalValidationError("Failed to save WASM binary");
		}

		// Rebuild Nginx configs because a new WASM module means we need to generate it in the global config
		await internalNginx.generateWasmModulesConfig();
		await internalNginx.reload();

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "wasm-module",
			object_id: omittedRow.id,
			meta: _.omit(data, ["file_content"]),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("wasm-module");

		return omittedRow;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {number}  data.id
	 * @param  {string}  [data.name]
	 * @param  {string}  [data.description]
	 * @param  {Object}  [data.meta]
	 * @return {Promise<Object>}
	 */
	update: async (access, data) => {
		await access.can("wasm_modules:update", data);
		const row = await internalWasmModule.get(access, { id: data.id });
		if (row.id !== data.id) {
			throw new errs.InternalValidationError(`Wasm Module could not be updated, IDs do not match: ${row.id} !== ${data.id}`);
		}

		await wasmModuleModel
			.query()
			.where({ id: data.id })
			.patch(
				/** @type {any} */ ({
					name: data.name,
					description: data.description,
					meta: data.meta,
				}),
			);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "wasm-module",
			object_id: data.id,
			meta: _.omit(data, ["file_content"]),
		});

		const freshRow = await internalWasmModule.get(access, { id: data.id });

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("wasm-module");

		return freshRow;
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   data
	 * @param  {number}  data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise<Object>}
	 */
	get: async (access, data) => {
		/** @type {any} */
		const thisData = data || {};
		const accessData = await access.can("wasm_modules:get", thisData.id);

		const query = wasmModuleModel
			.query()
			.select("wasm_module.*", wasmModuleModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.wasm_module_id", "=", "wasm_module.id").andOnVal("proxy_host.is_deleted", "=", 0);
			})
			.where("wasm_module.is_deleted", 0)
			.andWhere("wasm_module.id", thisData.id)
			.groupBy("wasm_module.id")
			.allowGraph("[owner,proxy_hosts]")
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("wasm_module.owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		let row = await query;

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(thisData.id);
		}

		row = utils.omitRow(omissions())(row);

		if (typeof data.omit !== "undefined" && data.omit !== null) {
			row = /** @type {any} */ (_.omit(row, data.omit));
		}
		return row;
	},

	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {number} data.id
	 * @returns {Promise<boolean>}
	 */
	delete: async (access, data) => {
		await access.can("wasm_modules:delete", data.id);
		const row = await internalWasmModule.get(access, {
			id: data.id,
			expand: ["proxy_hosts"],
		});

		if (!row || !row.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		// 1. update row to be deleted
		await wasmModuleModel.query().where("id", row.id).patch({
			is_deleted: 1,
		});

		// 2. update any proxy hosts that were using it
		if (row.proxy_hosts && row.proxy_hosts.length > 0) {
			await proxyHostModel.query().where("wasm_module_id", "=", row.id).patch({ wasm_module_id: 0 });

			row.proxy_hosts.map((_val, idx) => {
				row.proxy_hosts[idx].wasm_module_id = 0;
				return true;
			});

			await internalNginx.bulkGenerateConfigs(proxyHostModel, "proxy_host", row.proxy_hosts);
		}

		// 3. remove global config entry and reload nginx
		await internalNginx.generateWasmModulesConfig();
		await internalNginx.reload();

		// delete the wasm file
		try {
			await fs.promises.unlink(`/data/wasm/${row.id}.wasm`);
		} catch (_err) {
			// do nothing
		}

		// 4. audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "wasm-module",
			object_id: row.id,
			meta: _.omit(row, ["is_deleted", "proxy_hosts"]),
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("wasm-module");

		return true;
	},

	/**
	 * All Modules
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise<Array>}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("wasm_modules:list");

		const query = wasmModuleModel
			.query()
			.select("wasm_module.*", wasmModuleModel.raw("COUNT(proxy_host.id) as proxy_host_count"))
			.leftJoin("proxy_host", function () {
				this.on("proxy_host.wasm_module_id", "=", "wasm_module.id").andOnVal("proxy_host.is_deleted", "=", 0);
			})
			.where("wasm_module.is_deleted", 0)
			.groupBy("wasm_module.id")
			.allowGraph("[owner]")
			.orderBy("wasm_module.name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("wasm_module.owner_user_id", access.token.getUserId(1));
		}

		if (typeof searchQuery === "string") {
			query.where(function () {
				this.where("name", "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		let rows = await query;
		rows = utils.omitRows(omissions())(rows);

		return rows;
	},

	/**
	 * Count is used in reports
	 *
	 * @param   {number} user_id
	 * @param   {String}  visibility
	 * @returns {Promise<number>}
	 */
	getCount: async (user_id, visibility) => {
		const query = wasmModuleModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		const row = await query.first();
		return /** @type {any} */ (row).count || 0;
	},
};

export default internalWasmModule;
