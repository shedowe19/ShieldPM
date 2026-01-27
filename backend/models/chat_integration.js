import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class ChatIntegration extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;
	/** @type {number} */
	user_id;
	/** @type {string} */
	provider;
	/** @type {string} */
	token;
	/** @type {boolean} */
	enabled;
	/** @type {Object} */
	config;
	/** @type {Object} */
	meta;
	/** @type {import("./user.js").default} */
	user;

	static get tableName() {
		return "chat_integration";
	}

	static get relationMappings() {
		return {
			user: {
				relation: Model.BelongsToOneRelation,
				modelClass: import("./user.js"),
				join: {
					from: "chat_integration.user_id",
					to: "user.id",
				},
			},
		};
	}

	static get jsonSchema() {
		return {
			type: "object",
			required: ["provider", "token", "user_id"],

			properties: {
				id: { type: "integer" },
				created_on: { type: "string" },
				modified_on: { type: "string" },
				user_id: { type: "integer" },
				provider: { type: "string", enum: ["telegram"] }, // Matches CHAT_PROVIDER.TELEGRAM in frontend
				token: { type: "string" },
				enabled: { type: "boolean" },
				config: {
					type: "object",
					properties: {
						allowed_ids: {
							type: "array",
							items: { anyOf: [{ type: "string" }, { type: "number" }] },
						},
					},
				},
				meta: { type: "object" },
			},
		};
	}
}

export default ChatIntegration;
