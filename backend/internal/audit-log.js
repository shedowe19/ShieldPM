import { isSqlite } from "../lib/config.js";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import auditLogModel from "../models/audit-log.js";

/**
 * DDNS provider configuration can contain credentials and does not belong in audit responses.
 *
 * @param {string} objectType
 * @param {any} meta
 * @returns {any}
 */
const safeAuditMetadata = (objectType, meta) => {
	if (objectType !== "ddns-provider" || !meta || typeof meta !== "object") {
		return meta;
	}
	return Object.fromEntries(Object.entries(meta).filter(([key]) => key !== "config"));
};

/**
 * Redact historical DDNS events without changing the database model or its metadata.
 *
 * @param {any} row
 * @returns {any}
 */
const safeAuditRow = (row) => {
	if (row.object_type !== "ddns-provider") {
		return row;
	}
	const result = typeof row.$clone === "function" ? row.$clone() : { ...row };
	result.meta = safeAuditMetadata(result.object_type, result.meta);
	return result;
};

const internalAuditLog = {
	/**
	 * All logs
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @param   {Object}  [filters]
	 * @param   {String}  [filters.action]
	 * @param   {String}  [filters.object_type]
	 * @param   {number}  [filters.user_id]
	 * @param   {number}  [filters.object_id]
	 * @param   {String}  [filters.created_after]
	 * @param   {String}  [filters.created_before]
	 * @param   {Object}  [pagination]
	 * @param   {number}  pagination.limit
	 * @param   {number}  pagination.page
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery, filters = {}, pagination = undefined) => {
		await access.can("auditlog:list");

		const query = auditLogModel.query().orderBy("created_on", "DESC").orderBy("id", "DESC").allowGraph("[user]");

		// Search the complete audit context so administrators can locate an event by its action, resource type, or metadata.
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			const searchPattern = `%${searchQuery}%`;
			query.where(function () {
				this.where(castJsonIfNeed("meta"), "like", searchPattern)
					.orWhere("action", "like", searchPattern)
					.orWhere("object_type", "like", searchPattern);
			});
		}

		if (filters.action) {
			query.where("action", filters.action);
		}

		if (filters.object_type) {
			query.where("object_type", filters.object_type);
		}

		if (filters.user_id) {
			query.where("user_id", filters.user_id);
		}

		if (filters.object_id) {
			query.where("object_id", filters.object_id);
		}

		if (filters.created_after) {
			if (isSqlite())
				query.whereRaw("julianday(??, 'utc') >= julianday(?)", ["created_on", filters.created_after]);
			else query.where("created_on", ">=", filters.created_after);
		}

		if (filters.created_before) {
			if (isSqlite())
				query.whereRaw("julianday(??, 'utc') <= julianday(?)", ["created_on", filters.created_before]);
			else query.where("created_on", "<=", filters.created_before);
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		if (pagination) {
			const pageResult = await query.page(pagination.page - 1, pagination.limit);

			return {
				items: pageResult.results.map(safeAuditRow),
				pagination: {
					limit: pagination.limit,
					page: pagination.page,
					totalItems: pageResult.total,
					totalPages: Math.ceil(pageResult.total / pagination.limit),
				},
			};
		}

		return (await query.limit(100)).map(safeAuditRow);
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

		return safeAuditRow(row);
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
				meta: safeAuditMetadata(data.object_type, data.meta || {}),
			}),
		);
	},
};

export default internalAuditLog;
