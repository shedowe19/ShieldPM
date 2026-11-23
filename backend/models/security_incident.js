// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

/**
 * A detection result, not a host availability incident. The rule id, severity
 * and deduplication key make the row actionable without reading its message.
 */
export class SecurityIncident extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	created_on;
	/** @type {string} */
	last_seen_at;
	/** @type {string} */
	rule_id;
	/** @type {"low" | "medium" | "high" | "critical"} */
	severity;
	/** @type {"open" | "resolved"} */
	status;
	/** @type {string} */
	dedup_key;
	/** @type {string} */
	title;
	/** @type {string} */
	message;
	/** @type {number | null} */
	actor_user_id;
	/** @type {string | null} */
	actor_type;
	/** @type {number | null} */
	user_id;
	/** @type {string | null} */
	ip;
	/** @type {string | null} */
	request_id;
	/** @type {string | null} */
	session_id;
	/** @type {number | null} */
	audit_log_id;
	/** @type {number} */
	count;
	/** @type {Record<string, any> | null} */
	meta;
	/** @type {string | null} */
	resolved_at;

	static get tableName() {
		return "security_incident";
	}

	static get jsonAttributes() {
		return ["meta"];
	}
}

export default SecurityIncident;
