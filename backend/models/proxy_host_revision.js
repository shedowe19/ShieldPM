import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class ProxyHostRevision extends Model {
	/** @type {number} */ id;
	/** @type {number} */ host_id;
	/** @type {number|null} */ actor_user_id;
	/** @type {string} */ action;
	/** @type {string} */ created_on;
	/** @type {string} */ fingerprint;
	/** @type {string} */ encrypted_snapshot;
	static get tableName() {
		return "proxy_host_revision";
	}
	$beforeInsert() {
		this.created_on = new Date().toISOString();
	}
}
export default ProxyHostRevision;
