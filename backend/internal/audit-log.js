import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import auditLogModel from "../models/audit-log.js";

const internalAuditLog = {
	/**
	 * All logs
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @param   {Object}  [dateRange]
	 * @param   {String}  [dateRange.created_after]
	 * @param   {String}  [dateRange.created_before]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery, dateRange = {}) => {
		await access.can("auditlog:list");

		const query = auditLogModel
			.query()
			.orderBy("created_on", "DESC")
			.orderBy("id", "DESC")
			.limit(100)
			.allowGraph("[user]");

		// Search the complete audit context so administrators can locate an event by its action, resource type, or metadata.
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			const searchPattern = `%${searchQuery}%`;
			query.where(function () {
				this.where(castJsonIfNeed("meta"), "like", searchPattern)
					.orWhere("action", "like", searchPattern)
					.orWhere("object_type", "like", searchPattern);
			});
		}

		if (dateRange.created_after) {
			query.where("created_on", ">=", dateRange.created_after);
		}

		if (dateRange.created_before) {
			query.where("created_on", "<=", dateRange.created_before);
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		return await query;
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   [data]
	 * @param  {number}  [data.id]          Defaults to the token user
	 * @param  {Array}    [data.expand]
	 * @return {Promise}
	 */
	get: async (access, data) => {
		await access.can("auditlog:list");

		const query = auditLogModel.query().andWhere("id", data.id).allowGraph("[user]").first();

		if (typeof data.expand !== "undefined" && data.expand !== null) {
			query.withGraphFetched(`[${data.expand.join(", ")}]`);
		}

		const row = await query;

		if (!row?.id) {
			throw new errs.ItemNotFoundError(data.id);
		}

		return row;
	},

	/**
	 * This method should not be publicly used, it doesn't check certain things. It will be assumed
	 * that permission to add to audit log is already considered, however the access token is used for
	 * default user id determination.
	 *
	 * @param   {import("../lib/types.js").Access}   access
	 * @param   {Object}   data
	 * @param   {String}   data.action
	 * @param   {Number}   [data.user_id]
	 * @param   {Number}   [data.object_id]
	 * @param   {string}   [data.object_type]
	 * @param   {Object}   [data.meta]
	 * @returns {Promise}
	 */
	add: async (access, data) => {
		if (typeof data.user_id === "undefined" || !data.user_id) {
			data.user_id = access.token.getUserId(1);
		}
		if (typeof data.action === "undefined" || !data.action) {
			throw new errs.InternalValidationError("Audit log entry must contain an Action");
		}

		const accessId = typeof access.token.getUserId === "function" ? access.token.getUserId(1) : 0;

		return auditLogModel.query().insert(
			/** @type {any} */ ({
				user_id: accessId,
				action: data.action,
				object_type: data.object_type,
				object_id: data.object_id,
				meta: data.meta || {},
			}),
		);
	},
};

export default internalAuditLog;
