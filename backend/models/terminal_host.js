import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["enabled", "is_deleted"];

class TerminalHost extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;
	/** @type {number} */
	owner_user_id;
	/** @type {number} */
	enabled;
	/** @type {string} */
	type;
	/** @type {string} */
	name;
	/** @type {string} */
	host;
	/** @type {number} */
	port;
	/** @type {string} */
	auth_type;
	/** @type {string} */
	username;
	/** @type {string|null} */
	password;
	/** @type {string|null} */
	private_key;
	/** @type {Object} */
	meta;
	/** @type {number} */
	is_deleted;

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
		return "TerminalHost";
	}

	static get tableName() {
		return "terminal_host";
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
					from: "terminal_host.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
		};
	}
}

export default TerminalHost;
