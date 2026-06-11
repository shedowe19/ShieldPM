// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import Monitor from "./monitor.js";
import now from "./now_helper.js";

Model.knex(db());

class MonitorCheck extends Model {
	$beforeInsert() {
		if (typeof this.checked_on === "undefined") {
			this.checked_on = /** @type {any} */ (now());
		}
	}

	static get name() {
		return "MonitorCheck";
	}

	static get tableName() {
		return "monitor_check";
	}

	static get relationMappings() {
		return {
			monitor: {
				relation: Model.BelongsToOneRelation,
				modelClass: Monitor,
				join: {
					from: "monitor_check.monitor_id",
					to: "monitor.id",
				},
			},
		};
	}
}

export default MonitorCheck;
