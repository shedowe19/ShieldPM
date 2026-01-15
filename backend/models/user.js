// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import UserPermission from "./user_permission.js";

Model.knex(db());

const boolFields = ["is_deleted", "is_disabled"];

class User extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	name;
	/** @type {string} */
	nickname;
	/** @type {string} */
	email;
	/** @type {string[]} */
	roles;
	/** @type {number} */
	is_deleted;
	/** @type {number} */
	is_disabled;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;
	/** @type {import("./user_permission.js").default} */
	permissions;
	/** @type {string} */
	avatar;
	/** @type {number} */
	count;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());

		// Default for roles
		if (typeof this.roles === "undefined") {
			this.roles = [];
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
		return "User";
	}

	static get tableName() {
		return "user";
	}

	static get jsonAttributes() {
		return ["roles"];
	}

	static get relationMappings() {
		return {
			permissions: {
				relation: Model.HasOneRelation,
				modelClass: UserPermission,
				join: {
					from: "user.id",
					to: "user_permission.user_id",
				},
			},
		};
	}
}

export default User;
