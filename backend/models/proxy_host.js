// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import dayjs from "dayjs";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import AccessList from "./access_list.js";
import Certificate from "./certificate.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = [
	"is_deleted",
	"ssl_forced",
	"caching_enabled",
	"block_exploits",
	"allow_websocket_upgrade",
	"http2_support",
	"enabled",
	"hsts_enabled",
	"hsts_subdomains",
	"maintenance_on_failure",
	"disable_buffering",
	"maintenance_active",
];

class ProxyHost extends Model {
	/** @type {number} */
	id;
	/** @type {string[]} */
	domain_names;
	/** @type {Object} */
	meta;
	/** @type {Object[]} */
	locations;
	/** @type {number} */
	owner_user_id;
	/** @type {number} */
	access_list_id;
	/** @type {number} */
	certificate_id;
	/** @type {number} */
	enabled;
	/** @type {number} */
	ssl_forced;
	/** @type {number} */
	caching_enabled;
	/** @type {number} */
	block_exploits;
	/** @type {number} */
	allow_websocket_upgrade;
	/** @type {number} */
	http2_support;
	/** @type {number} */
	hsts_enabled;
	/** @type {number} */
	hsts_subdomains;
	/** @type {number} */
	disable_buffering;
	/** @type {number} */
	maintenance_active;
	/** @type {number} */
	maintenance_on_failure;
	/** @type {string|null} */
	maintenance_start;
	/** @type {string|null} */
	maintenance_end;
	/** @type {string|null} */
	bandwidth_limit;
	/** @type {number|null} */
	adv_limit_req_rate;
	/** @type {string|null} */
	adv_limit_req_unit;
	/** @type {number|null} */
	adv_limit_req_burst;
	/** @type {string|null} */
	forward_query;
	/** @type {string} */
	advanced_config;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());

		// Default for domain_names
		if (typeof this.domain_names === "undefined") {
			this.domain_names = [];
		}

		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}

		if (this.maintenance_start) {
			this.maintenance_start = dayjs(this.maintenance_start).format("YYYY-MM-DD HH:mm:ss");
		} else {
			this.maintenance_start = null;
		}

		if (this.maintenance_end) {
			this.maintenance_end = dayjs(this.maintenance_end).format("YYYY-MM-DD HH:mm:ss");
		} else {
			this.maintenance_end = null;
		}
	}

	$beforeUpdate() {
		this.modified_on = /** @type {any} */ (now());

		if (this.maintenance_start) {
			this.maintenance_start = dayjs(this.maintenance_start).format("YYYY-MM-DD HH:mm:ss");
		} else {
			this.maintenance_start = null;
		}

		if (this.maintenance_end) {
			this.maintenance_end = dayjs(this.maintenance_end).format("YYYY-MM-DD HH:mm:ss");
		} else {
			this.maintenance_end = null;
		}
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "ProxyHost";
	}

	static get tableName() {
		return "proxy_host";
	}

	static get jsonAttributes() {
		return ["domain_names", "meta", "locations"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "proxy_host.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			access_list: {
				relation: Model.HasOneRelation,
				modelClass: AccessList,
				join: {
					from: "proxy_host.access_list_id",
					to: "access_list.id",
				},
				modify: (qb) => {
					qb.where("access_list.is_deleted", 0);
				},
			},
			certificate: {
				relation: Model.HasOneRelation,
				modelClass: Certificate,
				join: {
					from: "proxy_host.certificate_id",
					to: "certificate.id",
				},
				modify: (qb) => {
					qb.where("certificate.is_deleted", 0);
				},
			},
		};
	}
}

export default ProxyHost;
