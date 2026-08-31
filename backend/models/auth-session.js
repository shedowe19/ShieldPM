// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { createFamilyId, createJti, hashToken, normalizeScope } from "../lib/auth-session-token.js";
import User from "./user.js";

Model.knex(db());

class AuthSession extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	user_id;
	/** @type {string} */
	family_id;
	/** @type {number | null} */
	parent_session_id;
	/** @type {string} */
	token_hash;
	/** @type {string} */
	jti;
	/** @type {string[]} */
	scope;
	/** @type {string} */
	created_at;
	/** @type {string} */
	expires_at;
	/** @type {string | null} */
	last_used_at;
	/** @type {string | null} */
	rotated_at;
	/** @type {string | null} */
	revoked_at;
	/** @type {string | null} */
	revoked_reason;
	/** @type {number | null} */
	replaced_by_session_id;
	/** @type {string | null} */
	created_ip;
	/** @type {string | null} */
	created_user_agent;
	/** @type {string | null} */
	auth_time;
	/** @type {string[]} */
	authentication_methods;
	/** @type {number | null} */
	actor_user_id;
	/** @type {number | null} */
	actor_session_id;
	/** @type {string | null} */
	impersonated_at;
	/** @type {import("./user.js").default} */
	user;
	/** @type {AuthSession | null} */
	parentSession;
	/** @type {AuthSession | null} */
	replacedBySession;

	$beforeInsert() {
		if (!this.family_id) {
			this.family_id = AuthSession.createFamilyId();
		}

		if (!this.jti) {
			this.jti = AuthSession.createJti();
		}

		this.scope = AuthSession.normalizeScope(this.scope);
	}

	$beforeUpdate() {
		if (typeof this.scope !== "undefined") {
			this.scope = AuthSession.normalizeScope(this.scope);
		}
	}

	static get name() {
		return "AuthSession";
	}

	static get tableName() {
		return "auth_sessions";
	}

	static get jsonAttributes() {
		return ["scope", "authentication_methods"];
	}

	static get relationMappings() {
		return {
			user: {
				relation: Model.BelongsToOneRelation,
				modelClass: User,
				join: {
					from: "auth_sessions.user_id",
					to: "user.id",
				},
			},
			parentSession: {
				relation: Model.BelongsToOneRelation,
				modelClass: AuthSession,
				join: {
					from: "auth_sessions.parent_session_id",
					to: "auth_sessions.id",
				},
			},
			replacedBySession: {
				relation: Model.BelongsToOneRelation,
				modelClass: AuthSession,
				join: {
					from: "auth_sessions.replaced_by_session_id",
					to: "auth_sessions.id",
				},
			},
		};
	}

	static hashToken(rawToken) {
		return hashToken(rawToken);
	}

	static createFamilyId() {
		return createFamilyId();
	}

	static createJti() {
		return createJti();
	}

	static normalizeScope(scope) {
		return normalizeScope(scope);
	}

	static buildLookup(rawToken) {
		return {
			token_hash: AuthSession.hashToken(rawToken),
		};
	}
}

export default AuthSession;
