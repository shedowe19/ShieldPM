// Objection Docs:
// http://vincit.github.io/objection.js/

import dayjs from "dayjs";
import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["enabled"];

class DdnsProvider extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;
	/** @type {number} */
	owner_user_id;
	/** @type {string} */
	name;
	/** @type {string} */
	provider;
	/** @type {string[]} */
	domains;
	/** @type {Object} */
	config;
	/** @type {string|null} */
	last_ipv4;
	/** @type {string|null} */
	last_ipv6;
	/** @type {string|null} */
	last_updated_on;
	/** @type {string|null} */
	last_error;
	/** @type {number} */
	enabled;
	/** @type {Object} */
	meta;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());

		// Default for domains
		if (typeof this.domains === "undefined") {
			this.domains = [];
		}

		// Default for config
		if (typeof this.config === "undefined") {
			this.config = {};
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
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "DdnsProvider";
	}

	static get tableName() {
		return "ddns_provider";
	}

	static get jsonAttributes() {
		return ["domains", "config", "meta"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "ddns_provider.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
		};
	}
}

export default DdnsProvider;
