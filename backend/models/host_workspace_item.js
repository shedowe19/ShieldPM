import { Model } from "objection";
import db from "../db.js";

Model.knex(db());
class HostWorkspaceItem extends Model {
	/** @type {number} */ id;
	/** @type {number} */ owner_user_id;
	/** @type {string} */ kind;
	/** @type {string} */ name;
	/** @type {any} */ definition;
	/** @type {string} */ created_on;
	/** @type {string} */ modified_on;
	static get tableName() {
		return "host_workspace_item";
	}
	static get jsonAttributes() {
		return ["definition"];
	}
	$beforeInsert() {
		this.created_on = new Date().toISOString();
		this.modified_on = this.created_on;
	}
	$beforeUpdate() {
		this.modified_on = new Date().toISOString();
	}
}
export default HostWorkspaceItem;
