import crypto from "node:crypto";
import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class AuthChallenge extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	user_id;
	/** @type {string} */
	challenge_hash;
	/** @type {string} */
	purpose;
	/** @type {Object} */
	meta;
	/** @type {string} */
	created_at;
	/** @type {string} */
	expires_at;
	/** @type {string | null} */
	consumed_at;

	static get tableName() {
		return "auth_challenge";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static hash(value) {
		return crypto.createHash("sha256").update(value, "utf8").digest("hex");
	}
}

export default AuthChallenge;
