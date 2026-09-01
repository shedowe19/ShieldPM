import crypto from "node:crypto";
import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class InitialSetupClaim extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	token_hash;
	/** @type {string} */
	created_at;
	/** @type {string | null} */
	consumed_at;
	/** @type {number | null} */
	claimed_user_id;
	/** @type {string | null} */
	claimed_ip;

	static get tableName() {
		return "initial_setup_claim";
	}

	static hashToken(value) {
		return crypto.createHash("sha256").update(value, "utf8").digest("hex");
	}
}

export default InitialSetupClaim;
