import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_verified", "is_deleted"];

class UserTwoFa extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	user_id;
	/** @type {string} */
	type;
	/** @type {string|null} */
	label;
	/** @type {string|null} */
	secret;
	/** @type {string|null} */
	public_key;
	/** @type {number} */
	counter;
	/** @type {string|null} */
	transports;
	/** @type {string|null} */
	credential_id_hash;
	/** @type {Object|null} */
	meta;
	/** @type {boolean} */
	is_verified;
	/** @type {boolean} */
	is_deleted;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = /** @type {any} */ (now());
	}

	$parseDatabaseJson(json) {
		const parsed = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(parsed, boolFields);
	}

	$formatDatabaseJson(json) {
		const formatted = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(formatted);
	}

	static get name() {
		return "UserTwoFa";
	}

	static get tableName() {
		return "user_2fa";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			user: {
				relation: Model.BelongsToOneRelation,
				modelClass: User,
				join: {
					from: "user_2fa.user_id",
					to: "user.id",
				},
			},
		};
	}

	/**
	 * Get all active (verified, non-deleted) 2FA methods for a user.
	 * @param {number} userId
	 * @returns {Promise<UserTwoFa[]>}
	 */
	static async getActiveForUser(userId) {
		return await UserTwoFa.query()
			.where({ user_id: userId, is_verified: 1, is_deleted: 0 })
			.whereIn("type", ["totp", "yubikey", "passkey", "duo"]);
	}

	/**
	 * Check whether a user has at least one active 2FA method.
	 * @param {number} userId
	 * @returns {Promise<boolean>}
	 */
	static async hasActive2FA(userId) {
		const count = await UserTwoFa.query()
			.where({ user_id: userId, is_verified: 1, is_deleted: 0 })
			.whereIn("type", ["totp", "yubikey", "passkey", "duo"])
			.resultSize();
		return count > 0;
	}
}

export default UserTwoFa;
