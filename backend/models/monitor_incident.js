import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";

Model.knex(db());

export class MonitorIncident extends Model {
	/** @type {number} */ id;
	/** @type {number} */ host_id;
	/** @type {string} */ opened_at;
	/** @type {string | null} */ resolved_at;
	/** @type {string} */ last_seen_at;
	/** @type {string | null} */ resolution;
	/** @type {number} */ failure_count;
	/** @type {string} */ message;
	static get tableName() {
		return "monitor_incident";
	}
}
export class MonitorObservation extends Model {
	/** @type {number} */ host_id;
	/** @type {string} */ checked_at;
	/** @type {string} */ state;
	/** @type {number} */ interval_seconds;
	static get tableName() {
		return "monitor_observation";
	}
	static get idColumn() {
		return "host_id";
	}
}
export class MonitorDaily extends Model {
	/** @type {number} */ id;
	/** @type {number} */ host_id;
	/** @type {string} */ day;
	/** @type {number} */ up_ms;
	/** @type {number} */ down_ms;
	/** @type {number} */ checks;
	static get tableName() {
		return "monitor_daily";
	}
}
export class MonitorLatency extends Model {
	/** @type {number} */ id;
	/** @type {number} */ host_id;
	/** @type {string} */ bucket;
	/** @type {number} */ samples;
	/** @type {number} */ total_ms;
	/** @type {number | null} */ min_ms;
	/** @type {number | null} */ max_ms;
	static get tableName() {
		return "monitor_latency";
	}
}
export class MonitorMute extends Model {
	/** @type {number} */ host_id;
	/** @type {string} */ starts_at;
	/** @type {string} */ ends_at;
	/** @type {string} */ reason;
	static get tableName() {
		return "monitor_mute";
	}
	static get idColumn() {
		return "host_id";
	}
}
export class NotificationTarget extends Model {
	/** @type {number} */ id;
	/** @type {number} */ owner_user_id;
	/** @type {string} */ name;
	/** @type {"webhook" | "ntfy" | "discord"} */ type;
	/** @type {boolean} */ enabled;
	/** @type {number[]} */ host_ids;
	/** @type {string} */ secret;
	/** @type {number} */ version;
	/** @type {string} */ created_on;
	/** @type {string} */ modified_on;
	static get tableName() {
		return "notification_target";
	}
	static get jsonAttributes() {
		return ["host_ids"];
	}
	$beforeInsert() {
		this.created_on = new Date().toISOString();
		this.modified_on = this.created_on;
	}
	$beforeUpdate() {
		this.modified_on = new Date().toISOString();
	}
	$parseDatabaseJson(json) {
		return convertIntFieldsToBool(super.$parseDatabaseJson(json), ["enabled"]);
	}
	$formatDatabaseJson(json) {
		return super.$formatDatabaseJson(convertBoolFieldsToInt(json, ["enabled"]));
	}
}
export class NotificationDelivery extends Model {
	/** @type {number} */ id;
	/** @type {number} */ target_id;
	/** @type {number} */ incident_id;
	/** @type {number} */ host_id;
	/** @type {string} */ event;
	/** @type {Record<string, any>} */ payload;
	/** @type {string} */ status;
	/** @type {number} */ attempts;
	/** @type {string} */ next_attempt_at;
	/** @type {string | null} */ last_error;
	/** @type {string} */ created_on;
	/** @type {string | null} */ sent_at;
	static get tableName() {
		return "notification_delivery";
	}
	static get jsonAttributes() {
		return ["payload"];
	}
}
