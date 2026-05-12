import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";

Model.knex(db());

const boolFields = ["is_deleted"];

class WasmModule extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;
	/** @type {number} */
	owner_user_id;
	/** @type {string} */
	name;
	/** @type {string} */
	description;
	/** @type {string} */
	filename;
	/** @type {number} */
	is_deleted;

	$beforeInsert() {
		this.created_on = new Date().toISOString();
		this.modified_on = new Date().toISOString();
		convertBoolFieldsToInt(this, boolFields);
	}

	$beforeUpdate() {
		this.modified_on = new Date().toISOString();
		convertBoolFieldsToInt(this, boolFields);
	}

	$afterGet(context) {
		super.$afterGet(context);
		convertIntFieldsToBool(this, boolFields);
	}

	static get tableName() {
		return "wasm_module";
	}

	static get idColumn() {
		return "id";
	}

	static get jsonSchema() {
		return {
			type: "object",
			required: ["name", "filename"],
			properties: {
				id: { type: "integer" },
				owner_user_id: { type: "integer" },
				name: { type: "string", maxLength: 255 },
				description: { type: "string" },
				filename: { type: "string", maxLength: 255 },
				is_deleted: { type: "integer" },
			},
		};
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.BelongsToOneRelation,
				modelClass: import.meta.url ? new URL("./user.js", import.meta.url).pathname : "user.js",
				join: {
					from: "wasm_module.owner_user_id",
					to: "user.id",
				},
				modify: (query) => {
					query.select(
						"id",
						"created_on",
						"modified_on",
						"is_deleted",
						"name",
						"nickname",
						"email",
						"avatar",
					);
				},
			},
		};
	}
}

export default WasmModule;
