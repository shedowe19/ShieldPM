import { Model } from "objection";
import db from "../db.js";

Model.knex(db());

/** Internal registry; legacy collisions retain every owner until explicitly resolved. */
export class HostDomainClaim extends Model {
	/** @type {string} */
	domain_key;
	/** @type {string} */
	domain_name;
	static get tableName() {
		return "host_domain_claim";
	}
	static get idColumn() {
		return "domain_key";
	}
}

export class HostDomainClaimOwner extends Model {
	/** @type {string} */
	domain_key;
	/** @type {string} */
	domain_name;
	/** @type {string} */
	host_type;
	/** @type {number} */
	host_id;
	static get tableName() {
		return "host_domain_claim_owner";
	}
	static get idColumn() {
		return ["domain_key", "host_type", "host_id"];
	}
}

export class HostDomainClaimLock extends Model {
	static get tableName() {
		return "host_domain_claim_lock";
	}
}
