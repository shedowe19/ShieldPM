import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";

Model.knex(db());

class ProxyHostMonitor extends Model {
	/** @type {number} */ id;
	/** @type {number} */ host_id;
	/** @type {boolean} */ enabled;
	/** @type {"http" | "tcp"} */ type;
	/** @type {string} */ path;
	/** @type {number} */ interval_seconds;
	/** @type {number} */ timeout_ms;
	/** @type {number} */ expected_status;
	/** @type {boolean} */ alert_enabled;
	/** @type {string | null} */ upstream_ca;
	/** @type {string | null} */ upstream_server_name;
	/** @type {boolean} */ skip_certificate_verification;
	/** @type {number} */ version;
	/** @type {string} */ state;
	/** @type {string | null} */ checked_at;
	/** @type {string | null} */ next_check_at;
	/** @type {number | null} */ response_ms;
	/** @type {number | null} */ status_code;
	/** @type {string | null} */ message;
	/** @type {string | null} */ last_alert_at;
	/** @type {string | null} */ last_alert_state;
	/** @type {string} */ created_on;
	/** @type {string} */ modified_on;

	static get tableName() {
		return "proxy_host_monitor";
	}

	$beforeInsert() {
		this.created_on = new Date().toISOString();
		this.modified_on = this.created_on;
	}

	$beforeUpdate() {
		this.modified_on = new Date().toISOString();
	}

	$parseDatabaseJson(json) {
		return convertIntFieldsToBool(super.$parseDatabaseJson(json), [
			"enabled",
			"alert_enabled",
			"skip_certificate_verification",
		]);
	}

	$formatDatabaseJson(json) {
		return super.$formatDatabaseJson(
			convertBoolFieldsToInt(json, ["enabled", "alert_enabled", "skip_certificate_verification"]),
		);
	}
}

export default ProxyHostMonitor;
