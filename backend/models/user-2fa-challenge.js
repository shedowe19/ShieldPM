import crypto from "node:crypto";
import { Model } from "objection";
import db from "../db.js";
import User from "./user.js";

Model.knex(db());

class UserTwoFaChallenge extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	user_id;
	/** @type {string} */
	challenge_id_hash;
	/** @type {string} */
	type;
	/** @type {string} */
	purpose;
	/** @type {string} */
	session_binding;
	/** @type {string|null} */
	flow_key;
	/** @type {string} */
	challenge;
	/** @type {string|null} */
	rp_id;
	/** @type {string|null} */
	origin;
	/** @type {string} */
	expires_at;
	/** @type {string|null} */
	consumed_at;
	/** @type {string} */
	created_at;

	static get name() {
		return "UserTwoFaChallenge";
	}

	static get tableName() {
		return "user_2fa_challenges";
	}

	static get relationMappings() {
		return {
			user: {
				relation: Model.BelongsToOneRelation,
				modelClass: User,
				join: {
					from: "user_2fa_challenges.user_id",
					to: "user.id",
				},
			},
		};
	}

	/**
	 * Hash a bearer challenge before using it as a database lookup key.
	 * @param {string} challengeId
	 * @returns {string}
	 */
	static hashChallengeId(challengeId) {
		return crypto.createHash("sha256").update(challengeId, "utf8").digest("hex");
	}
}

export default UserTwoFaChallenge;
