import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";

Model.knex(db());

class ProxyHostMonitorCheck extends Model {
	/** @type {number} */ id;
	/** @type {number} */ host_id;
	/** @type {string} */ checked_at;
	/** @type {"up" | "down"} */ state;
	/** @type {number | null} */ response_ms;
	/** @type {number | null} */ status_code;
	/** @type {string | null} */ message;
	/** @type {boolean} */ transition;

	static get tableName() {
		return "proxy_host_monitor_check";
	}

	$parseDatabaseJson(json) {
		return convertIntFieldsToBool(super.$parseDatabaseJson(json), ["transition"]);
	}

	$formatDatabaseJson(json) {
		return super.$formatDatabaseJson(convertBoolFieldsToInt(json, ["transition"]));
	}
}

export default ProxyHostMonitorCheck;
