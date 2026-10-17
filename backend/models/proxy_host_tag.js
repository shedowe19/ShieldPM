import { Model } from "objection";
import db from "../db.js";

Model.knex(db());
class ProxyHostTag extends Model {
	/** @type {number} */ id;
	/** @type {number} */ host_id;
	/** @type {string} */ tag;
	/** @type {string} */ created_on;
	static get tableName() {
		return "proxy_host_tag";
	}
	$beforeInsert() {
		this.created_on = new Date().toISOString();
	}
}
export default ProxyHostTag;
