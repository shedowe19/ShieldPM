// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import ProxyHost from "./proxy_host.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["enabled", "notification_enabled"];

class Monitor extends Model {
	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());

		if (typeof this.type === "undefined") this.type = "http";
		if (typeof this.method === "undefined") this.method = "GET";
		if (typeof this.interval_seconds === "undefined") this.interval_seconds = 60;
		if (typeof this.timeout_seconds === "undefined") this.timeout_seconds = 5;
		if (typeof this.expected_status === "undefined") this.expected_status = 200;
		if (typeof this.failure_threshold === "undefined") this.failure_threshold = 3;
		if (typeof this.consecutive_failures === "undefined") this.consecutive_failures = 0;
		if (typeof this.status === "undefined") this.status = "pending";
		if (typeof this.enabled === "undefined") this.enabled = 1;
		if (typeof this.notification_enabled === "undefined") this.notification_enabled = 1;
		if (typeof this.meta === "undefined") this.meta = {};
	}

	$beforeUpdate() {
		this.modified_on = /** @type {any} */ (now());
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "Monitor";
	}

	static get tableName() {
		return "monitor";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "monitor.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => qb.where("user.is_deleted", 0),
			},
			proxyHost: {
				relation: Model.BelongsToOneRelation,
				modelClass: ProxyHost,
				join: {
					from: "monitor.proxy_host_id",
					to: "proxy_host.id",
				},
				modify: (qb) => qb.where("proxy_host.is_deleted", 0),
			},
		};
	}
}

export default Monitor;
