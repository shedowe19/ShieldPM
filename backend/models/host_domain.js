import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";
import ProxyHost from "./proxy_host.js";

Model.knex(db());

class HostDomain extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	proxy_host_id;
	/** @type {string} */
	domain_name;
	/** @type {string|null} */
	created_on;
	/** @type {string|null} */
	modified_on;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());
	}

	$beforeUpdate() {
		this.modified_on = /** @type {any} */ (now());
	}

	static get name() {
		return "HostDomain";
	}

	static get tableName() {
		return "host_domain";
	}

	static get relationMappings() {
		return {
			proxy_host: {
				relation: Model.BelongsToOneRelation,
				modelClass: ProxyHost,
				join: {
					from: "host_domain.proxy_host_id",
					to: "proxy_host.id",
				},
			},
		};
	}
}

export default HostDomain;
