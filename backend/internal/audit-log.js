import { isSqlite } from "../lib/config.js";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import { getRequestContext } from "../lib/request-context.js";
import { global as logger } from "../logger.js";
import auditLogModel from "../models/audit-log.js";

export const DEFAULT_AUDIT_RETENTION_DAYS = 365;

/**
 * Columns that are persisted for correlation and SIEM consumption but are not
 * part of the published `GET /api/audit-log` response contract yet. The API is
 * also consumed by the UI and AI tools, so it keeps returning the documented
 * shape until the response schema is extended in a dedicated change.
 */
const INTERNAL_ONLY_FIELDS = [
	"ip",
	"user_agent",
	"session_id",
	"request_id",
	"outcome",
	"actor_user_id",
	"actor_type",
	"jti",
];

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
 * Redact historical DDNS events without changing the database model or its metadata
 * and keep request-correlation columns out of the public API shape.
 *
 * @param {any} row
 * @returns {any}
 */
const safeAuditRow = (row) => {
	const hasInternalFields = INTERNAL_ONLY_FIELDS.some((field) => field in row);
	if (row.object_type !== "ddns-provider" && !hasInternalFields) {
		return row;
	}
	const result = typeof row.$clone === "function" ? row.$clone() : { ...row };
	if (result.object_type === "ddns-provider") {
		result.meta = safeAuditMetadata(result.object_type, result.meta);
	}
	for (const field of INTERNAL_ONLY_FIELDS) {
		if (field in result) {
			delete result[field];
		}
	}
	return result;
};

const clip = (value, max) => {
	if (value === null || typeof value === "undefined" || value === "") {
		return null;
	}
	const result = String(value)
		.replace(/\p{Cc}/gu, " ")
		.trim();
	return result ? result.slice(0, max) : null;
};

const claim = (access, key) => {
	if (!access?.token || typeof access.token.get !== "function") {
		return null;
	}
	return access.token.get(key);
};

const integerOrNull = (value) => {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Configuration is read at cleanup time so operators can change retention without a restart.
 *
 * @param {string | number | undefined} [value]
 * @returns {number}
 */
export const auditRetentionDays = (value = process.env.AUDIT_RETENTION_DAYS) => {
	const parsed = Number.parseInt(String(value ?? ""), 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_AUDIT_RETENTION_DAYS;
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
					.orWhere("object_type", "like", searchPattern)
					.orWhere("ip", "like", searchPattern)
					.orWhere("request_id", "like", searchPattern);
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
	 * The request context (IP, user agent, request id, session id) is read from
	 * AsyncLocalStorage so all existing call sites keep their signature.
	 *
	 * @param   {import("../lib/types.js").Access}   access
	 * @param   {Object}   data
	 * @param   {String}   data.action
	 * @param   {Number}   [data.user_id]
	 * @param   {Number}   [data.object_id]
	 * @param   {string}   [data.object_type]
	 * @param   {Object}   [data.meta]
	 * @param   {string}   [data.outcome]
	 * @param   {number}   [data.actor_user_id]
	 * @param   {string}   [data.actor_type]
	 * @param   {string}   [data.ip]
	 * @param   {string}   [data.user_agent]
	 * @param   {string}   [data.session_id]
	 * @param   {string}   [data.request_id]
	 * @param   {string}   [data.jti]
	 * @returns {Promise}
	 */
	add: async (access, data) => {
		if (typeof data.action === "undefined" || !data.action) {
			throw new errs.InternalValidationError("Audit log entry must contain an Action");
		}

		const context = getRequestContext();
		const accessId = typeof access?.token?.getUserId === "function" ? access.token.getUserId(1) : 0;

		// `act` marks an impersonated token: the real actor is the administrator
		// and `user_id` stays the target account.
		const act = claim(access, "act");
		const actId = integerOrNull(typeof act === "object" && act !== null ? (act.sub ?? act.id ?? act.user_id) : act);
		const tokenAttributes = claim(access, "attrs");
		const authenticatedUserId = integerOrNull(tokenAttributes?.id);
		const sessionId = claim(access, "sid") ?? claim(access, "session_id") ?? claim(access, "family_id");

		const row = {
			user_id: Number.isSafeInteger(data.user_id) ? data.user_id : accessId,
			action: data.action,
			object_type: data.object_type,
			object_id: data.object_id,
			meta: safeAuditMetadata(data.object_type, data.meta || {}),
			ip: clip(data.ip ?? context?.ip, 45),
			user_agent: clip(data.user_agent ?? context?.userAgent, 512),
			session_id: clip(data.session_id ?? sessionId ?? context?.sessionId, 64),
			request_id: clip(data.request_id ?? context?.requestId, 64),
			outcome: clip(data.outcome, 16) ?? "success",
			actor_user_id: integerOrNull(data.actor_user_id) ?? actId ?? authenticatedUserId ?? null,
			actor_type: clip(data.actor_type, 16) ?? (actId ? "impersonated" : authenticatedUserId ? "user" : "system"),
			jti: clip(data.jti ?? claim(access, "jti"), 64),
		};

		try {
			return await auditLogModel.query().insert(/** @type {any} */ (row));
		} catch (error) {
			// Auditing must never break the operation it documents: a failed
			// insert is reported to the operator but the mutation stays committed.
			logger.error(`[Audit] Failed to persist "${data.action}" event: ${error?.message}`);
			return null;
		}
	},

	/**
	 * Delete audit rows older than the configured retention. Intended to run from
	 * the existing hourly housekeeping loop.
	 *
	 * @param   {number}  [retentionDays]
	 * @returns {Promise<number>} deleted row count
	 */
	cleanup: async (retentionDays = auditRetentionDays()) => {
		// Retention is a positive integer; validate again before it is embedded
		// in the dialect-specific interval expression below.
		const days = Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : auditRetentionDays();
		const query = auditLogModel.query();
		const dialect = auditLogModel.knex?.()?.client?.dialect ?? "sqlite3";
		const deleted =
			dialect === "postgresql"
				? await query.whereRaw(`created_on < NOW() - INTERVAL '${days} days'`).delete()
				: dialect === "sqlite3"
					? await query.whereRaw(`julianday(created_on) < julianday('now','localtime') - ${days}`).delete()
					: await query.whereRaw(`created_on < DATE_SUB(NOW(), INTERVAL ${days} DAY)`).delete();
		if (deleted) {
			logger.info(`[Audit] Removed ${deleted} entries older than ${days} days`);
		}
		return deleted;
	},
};

export default internalAuditLog;
