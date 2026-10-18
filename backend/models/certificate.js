// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import errs from "../lib/error.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import deadHostModel from "./dead_host.js";
import now from "./now_helper.js";
import proxyHostModel from "./proxy_host.js";
import redirectionHostModel from "./redirection_host.js";
import streamModel from "./stream.js";
import userModel from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted"];
const dateFields = ["created_on", "modified_on", "expires_on"];
const sqlDatePattern = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?$/;
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?([Zz]|[+-](\d{2}):(\d{2}))$/;

/** Keep certificate DATETIME writes valid in strict MySQL without changing SQL clock expressions. */
const mysqlDateTime = (value, field) => {
	if (
		value &&
		(typeof value.toKnexRaw === "function" || (value.isRawInstance && typeof value.toSQL === "function"))
	) {
		return value;
	}
	const invalid = () => {
		throw new errs.ValidationError(`Invalid certificate ${field} timestamp`);
	};
	if (value instanceof Date) {
		if (!Number.isFinite(value.getTime()) || value.getUTCFullYear() < 1000 || value.getUTCFullYear() > 9999) {
			return invalid();
		}
		return new Date(value.getTime() - value.getUTCMilliseconds());
	}
	if (typeof value !== "string") return invalid();
	const sqlMatch = sqlDatePattern.exec(value);
	const match = sqlMatch || isoDatePattern.exec(value);
	if (!match) return invalid();
	const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
	const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
	if (
		Number(year) < 1000 ||
		Number(month) < 1 ||
		Number(month) > 12 ||
		Number(day) < 1 ||
		Number(day) > daysInMonth ||
		Number(hour) > 23 ||
		Number(minute) > 59 ||
		Number(second) > 59 ||
		Number(offsetHour || 0) > 23 ||
		Number(offsetMinute || 0) > 59
	) {
		return invalid();
	}
	if (sqlMatch) return value;
	const instant = new Date(value);
	if (!Number.isFinite(instant.getTime()) || instant.getUTCFullYear() < 1000 || instant.getUTCFullYear() > 9999) {
		return invalid();
	}
	// Bind a real instant so mysql2 applies the same connection timezone used when reading DATETIME.
	// Truncate to the existing DATETIME(0) precision before the driver can round fractional seconds.
	instant.setUTCMilliseconds(0);
	return instant;
};

class Certificate extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	owner_user_id;
	/** @type {string} */
	provider;
	/** @type {string} */
	nice_name;
	/** @type {string[]} */
	domain_names;
	/** @type {string} */
	expires_on;
	/** @type {number} */
	is_deleted;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;
	/** @type {Object} */
	meta;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());

		// Default for expires_on
		if (typeof this.expires_on === "undefined") {
			this.expires_on = /** @type {any} */ (now());
		}

		// Default for domain_names
		if (typeof this.domain_names === "undefined") {
			this.domain_names = [];
		}

		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = /** @type {any} */ (now());
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		if (["mysql", "mysql2"].includes(this.$knex()?.client?.config?.client)) {
			for (const field of dateFields) {
				if (typeof thisJson[field] !== "undefined") thisJson[field] = mysqlDateTime(thisJson[field], field);
			}
		}
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "Certificate";
	}

	static get tableName() {
		return "certificate";
	}

	static get jsonAttributes() {
		return ["domain_names", "meta"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: userModel,
				join: {
					from: "certificate.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			proxy_hosts: {
				relation: Model.HasManyRelation,
				modelClass: proxyHostModel,
				join: {
					from: "certificate.id",
					to: "proxy_host.certificate_id",
				},
				modify: (qb) => {
					qb.where("proxy_host.is_deleted", 0);
				},
			},
			dead_hosts: {
				relation: Model.HasManyRelation,
				modelClass: deadHostModel,
				join: {
					from: "certificate.id",
					to: "dead_host.certificate_id",
				},
				modify: (qb) => {
					qb.where("dead_host.is_deleted", 0);
				},
			},
			redirection_hosts: {
				relation: Model.HasManyRelation,
				modelClass: redirectionHostModel,
				join: {
					from: "certificate.id",
					to: "redirection_host.certificate_id",
				},
				modify: (qb) => {
					qb.where("redirection_host.is_deleted", 0);
				},
			},
			streams: {
				relation: Model.HasManyRelation,
				modelClass: streamModel,
				join: {
					from: "certificate.id",
					to: "stream.certificate_id",
				},
				modify: (qb) => {
					qb.where("stream.is_deleted", 0);
				},
			},
		};
	}
}

export default Certificate;
