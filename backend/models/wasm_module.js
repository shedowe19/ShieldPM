// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import proxyHostModel from "./proxy_host.js";
import userModel from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted"];

class WasmModule extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	owner_user_id;
	/** @type {string} */
	name;
	/** @type {string|null} */
	description;
	/** @type {string} */
	file_name;
	/** @type {number} */
	is_deleted;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;
	/** @type {Object} */
	meta;

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
		return "WasmModule";
	}

	static get tableName() {
		return "wasm_module";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: userModel,
				join: {
					from: "wasm_module.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			proxy_hosts: {
				relation: Model.HasManyRelation,
				modelClass: proxyHostModel,
				join: {
					from: "wasm_module.id",
					to: "proxy_host.wasm_module_id",
				},
				modify: (qb) => {
					qb.where("proxy_host.is_deleted", 0);
				},
			},
		};
	}
}

export default WasmModule;
