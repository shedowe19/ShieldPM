import crypto from "node:crypto";
import { Model } from "objection";
import db from "../db.js";
import User from "./user.js";

Model.knex(db());

const hash = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

class OidcIdentity extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	user_id;
	/** @type {string} */
	binding_hash;
	/** @type {string} */
	issuer_hash;
	/** @type {string} */
	subject_hash;
	/** @type {string} */
	issuer;
	/** @type {string} */
	subject;
	/** @type {string | null} */
	email_at_link;
	/** @type {string} */
	created_at;
	/** @type {string | null} */
	last_login_at;
	/** @type {User} */
	user;

	static get tableName() {
		return "oidc_identity";
	}

	static get relationMappings() {
		return {
			user: {
				relation: Model.BelongsToOneRelation,
				modelClass: User,
				join: {
					from: "oidc_identity.user_id",
					to: "user.id",
				},
			},
		};
	}

	static normalizeIssuer(value) {
		const issuer = new URL(value);
		issuer.hash = "";
		issuer.search = "";
		issuer.hostname = issuer.hostname.toLowerCase();
		issuer.pathname = issuer.pathname.replace(/\/+$/, "");
		return issuer.toString().replace(/\/$/, "");
	}

	static buildIdentity(issuerValue, subjectValue) {
		const issuer = OidcIdentity.normalizeIssuer(issuerValue);
		const subject = String(subjectValue || "");
		if (!subject || Buffer.byteLength(subject, "utf8") > 512) {
			throw new TypeError("OIDC subject must be between 1 and 512 bytes");
		}

		return {
			issuer,
			subject,
			issuer_hash: hash(issuer),
			subject_hash: hash(subject),
			binding_hash: hash(`${issuer}\0${subject}`),
		};
	}
}

export default OidcIdentity;
