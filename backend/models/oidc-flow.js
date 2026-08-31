import crypto from "node:crypto";
import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

class OidcFlow extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	flow_hash;
	/** @type {string} */
	state_hash;
	/** @type {string} */
	nonce;
	/** @type {string} */
	pkce_verifier;
	/** @type {"login" | "link"} */
	purpose;
	/** @type {number | null} */
	user_id;
	/** @type {string} */
	redirect_uri;
	/** @type {string} */
	issuer_hash;
	/** @type {string} */
	created_at;
	/** @type {string} */
	expires_at;
	/** @type {string | null} */
	consumed_at;

	static get tableName() {
		return "oidc_flow";
	}

	static hash(value) {
		return crypto.createHash("sha256").update(value, "utf8").digest("hex");
	}
}

export default OidcFlow;
