import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class DashboardNote extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	content;
	/** @type {string} */
	color;
	/** @type {number} */
	position;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());

		if (typeof this.color === "undefined") {
			this.color = "yellow";
		}
	}

	$beforeUpdate() {
		this.modified_on = /** @type {any} */ (now());
	}

	static get name() {
		return "DashboardNote";
	}

	static get tableName() {
		return "dashboard_note";
	}
}

export default DashboardNote;
