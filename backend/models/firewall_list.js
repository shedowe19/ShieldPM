import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";

Model.knex(db());

class FirewallList extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	name;
	/** @type {string} */
	reason;
	/** @type {string} */
	description;
	/** @type {number} */
	owner_user_id;
	/** @type {string} */
	source_type;
	/** @type {string} */
	source_url;
	/** @type {number} */
	update_interval_hours;
	/** @type {boolean} */
	enabled;
	/** @type {string} */
	entries;
	/** @type {number} */
	entry_count;
	/** @type {string|null} */
	last_updated_on;
	/** @type {string|null} */
	last_error;
	/** @type {boolean} */
	is_deleted;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());
	}

	$beforeUpdate() {
		this.modified_on = /** @type {any} */ (now());
	}

	$parseDatabaseJson(json) {
		return convertIntFieldsToBool(super.$parseDatabaseJson(json), ["enabled", "is_deleted"]);
	}

	$formatDatabaseJson(json) {
		return super.$formatDatabaseJson(convertBoolFieldsToInt(json, ["enabled", "is_deleted"]));
	}

	static get tableName() {
		return "firewall_list";
	}
}

export default FirewallList;
