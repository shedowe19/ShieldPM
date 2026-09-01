import _ from "lodash";
import errs from "../lib/error.js";
import DdnsProvider from "../models/ddns_provider.js";
import internalAuditLog from "./audit-log.js";
import internalDdns from "./ddns.js";
import internalGitOps from "./gitops.js";

const internalDdnsProvider = {
	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		await access.can("ddns_providers:create", data);

		const thisData = _.cloneDeep(data);
		thisData.owner_user_id = access.token.getUserId(1);

		const row = await DdnsProvider.query().insertAndFetch(thisData);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "ddns-provider",
			object_id: row.id,
			meta: row,
		});

		// Trigger initial update in background
		void internalDdns.process(true);

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("ddns-provider");

		return row;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {number}  data.id
	 * @return {Promise}
	 */
	update: async (access, data) => {
		await access.can("ddns_providers:update", data.id);
		const existing = await internalDdnsProvider.get(access, { id: data.id });
		if (!existing) throw new errs.ItemNotFoundError(data.id);

		const thisData = _.cloneDeep(data);

		await DdnsProvider.query().patchAndFetchById(thisData.id, thisData);
		const row = await internalDdnsProvider.get(access, { id: thisData.id });

		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "ddns-provider",
			object_id: row.id,
			meta: row,
		});

		// Trigger update
		void internalDdns.process(true);

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("ddns-provider");

		return row;
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @return {Promise}
	 */
	get: async (access, data) => {
		const accessData = await access.can("ddns_providers:get", data.id);
		const query = DdnsProvider.query().where("id", data.id);

		if (accessData.permission_visibility !== "all") {
			query.where("owner_user_id", access.token.getUserId(1));
		}

		const row = await query.first();
		if (!row) throw new errs.ItemNotFoundError(data.id);
		return row;
	},

	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @return {Promise}
	 */
	getAll: async (access) => {
		const accessData = await access.can("ddns_providers:list");
		const query = DdnsProvider.query().orderBy("name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.where("owner_user_id", access.token.getUserId(1));
		}

		return await query;
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("ddns_providers:delete", { id: data.id });

		const provider = await internalDdnsProvider.get(access, { id: data.id });

		await /** @type {any} */ (DdnsProvider).query().deleteById(data.id);

		// Audit Log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "ddns-provider",
			object_id: data.id,
			meta: {
				name: provider.name,
			},
		});

		// Trigger GitOps auto-push
		internalGitOps.triggerAutoPush("ddns-provider");

		return true;
	},

	/**
	 * Force Update / Test
	 */
	test: async (access, data) => {
		const row = await internalDdnsProvider.get(access, { id: data.id });
		const ips = await internalDdns.getWanIps();
		await internalDdns.updateProvider(row, ips);
		return { status: "success", ips };
	},
};

export default internalDdnsProvider;
