// Objection Docs:
// http://vincit.github.io/objection.js/

import dayjs from "dayjs";
import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import AccessList from "./access_list.js";
import Certificate from "./certificate.js";
import FirewallPolicy from "./firewall_policy.js";
import now from "./now_helper.js";
import TorOnion from "./tor_onion.js";
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
	"security_crowdsec",
	"maintenance_active",
	"php_enabled",
	"git_sync_enabled",
	"anubis_enabled",
	"turbo_loader",
];

class ProxyHost extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	forward_scheme;
	/** @type {string} */
	forward_host;
	/** @type {number} */
	forward_port;
	/** @type {string[]} */
	domain_names;
	/** @type {Object[]} */
	host_domains;
	/** @type {Object} */
	meta;
	/** @type {string} */
	note;
	/** @type {Object[]} */
	locations;
	/** @type {number} */
	owner_user_id;
	/** @type {number} */
	access_list_id;
	/** @type {number|null} */
	firewall_policy_id;
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
	anubis_enabled;
	/** @type {Object[]|null} */
	anubis_rules;
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
	/** @type {number} */
	turbo_loader;
	/** @type {number|null} */
	adv_limit_req_rate;
	/** @type {string|null} */
	adv_limit_req_unit;
	/** @type {number|null} */
	adv_limit_req_burst;
	/** @type {string|null} */
	forward_query;
	/** @type {string|null} */
	php_override_ini;
	/** @type {string|null} */
	index_file;
	/** @type {string} */
	advanced_config;

	// Git Sync fields
	/** @type {string|null} */
	git_repo_url;
	/** @type {string} */
	git_branch;
	/** @type {boolean} */
	git_sync_enabled;
	/** @type {number} */
	git_poll_interval;
	/** @type {string} */
	git_poll_unit;
	/** @type {string|null} */
	git_credentials;
	/** @type {string|null} */
	git_last_sync;
	/** @type {string|null} */
	git_last_commit;
	/** @type {string|null} */
	git_last_error;

	// Service Icon fields
	/** @type {string|null} */
	icon_url;
	/** @type {string} */
	icon_type;

	// Terminal fields (for forward_scheme: 'terminal')
	/** @type {string|null} */
	terminal_host;
	/** @type {number|null} */
	terminal_port;
	/** @type {string|null} */
	terminal_username;
	/** @type {string|null} */
	terminal_auth_type;
	/** @type {string|null} */
	terminal_password;
	/** @type {string|null} */
	terminal_private_key;

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

		// Only format maintenance dates if they are explicitly being set (not undefined)
		// Do NOT set to null if undefined - this would override partial patches
		if (typeof this.maintenance_start !== "undefined") {
			this.maintenance_start = this.maintenance_start
				? dayjs(this.maintenance_start).format("YYYY-MM-DD HH:mm:ss")
				: null;
		}

		if (typeof this.maintenance_end !== "undefined") {
			this.maintenance_end = this.maintenance_end
				? dayjs(this.maintenance_end).format("YYYY-MM-DD HH:mm:ss")
				: null;
		}
	}

	$afterGet() {
		// Map the host_domains relation back into the legacy domain_names array format
		// This ensures seamless compatibility with APIs and Nginx templates
		if (this.host_domains && Array.isArray(this.host_domains)) {
			this.domain_names = this.host_domains.map((hd) => hd.domain_name);
		} else if (!this.domain_names) {
			this.domain_names = [];
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
		return ["domain_names", "meta", "locations", "anubis_rules"];
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
			firewall_policy: {
				relation: Model.HasOneRelation,
				modelClass: FirewallPolicy,
				join: {
					from: "proxy_host.firewall_policy_id",
					to: "firewall_policy.id",
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
			tor_onion: {
				relation: Model.HasOneRelation,
				modelClass: TorOnion,
				join: {
					from: "proxy_host.id",
					to: "tor_onion.proxy_host_id",
				},
				modify: (qb) => {
					qb.where("tor_onion.is_deleted", 0);
				},
			},
			host_domains: {
				relation: Model.HasManyRelation,
				// We use a dynamic import/require string here to avoid circular dependencies
				modelClass: import.meta.url ? new URL("./host_domain.js", import.meta.url).pathname : "host_domain.js",
				join: {
					from: "proxy_host.id",
					to: "host_domain.proxy_host_id",
				},
			},
		};
	}
}

export default ProxyHost;
