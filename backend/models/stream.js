import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import Certificate from "./certificate.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted", "enabled", "tcp_forwarding", "udp_forwarding", "proxy_protocol_forwarding"];

class Stream extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	incoming_port;
	/** @type {string} */
	forwarding_host;
	/** @type {number} */
	forwarding_port;
	/** @type {number} */
	tcp_forwarding;
	/** @type {number} */
	udp_forwarding;
	/** @type {number} */
	certificate_id;
	/** @type {Object} */
	meta;
	/** @type {number} */
	is_deleted;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());

		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
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
		return "Stream";
	}

	static get tableName() {
		return "stream";
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
					from: "stream.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			certificate: {
				relation: Model.HasOneRelation,
				modelClass: Certificate,
				join: {
					from: "stream.certificate_id",
					to: "certificate.id",
				},
				modify: (qb) => {
					qb.where("certificate.is_deleted", 0);
				},
			},
		};
	}
}

export default Stream;
