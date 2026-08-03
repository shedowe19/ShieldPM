import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";

Model.knex(db());

const boolFields = ["enabled"];

class FirewallPolicy extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	name;
	/** @type {boolean} */
	enabled;
	/** @type {"deny"|"drop"} */
	action;
	/** @type {"off"|"allow"|"block"} */
	geo_mode;
	/** @type {string[]} */
	geo_countries;
	/** @type {string[]} */
	allow_cidrs;
	/** @type {string[]} */
	block_cidrs;
	/** @type {string[]} */
	feed_urls;
	/** @type {number} */
	refresh_interval_hours;
	/** @type {Object} */
	feed_status;
	/** @type {number} */
	total_cidrs;
	/** @type {string|null} */
	last_updated_on;
	/** @type {string|null} */
	last_error;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());
		this.geo_countries ??= [];
		this.allow_cidrs ??= [];
		this.block_cidrs ??= [];
		this.feed_urls ??= [];
		this.feed_status ??= {};
	}

	$beforeUpdate() {
		this.modified_on = /** @type {any} */ (now());
	}

	$parseDatabaseJson(json) {
		return convertIntFieldsToBool(super.$parseDatabaseJson(json), boolFields);
	}

	$formatDatabaseJson(json) {
		return super.$formatDatabaseJson(convertBoolFieldsToInt(json, boolFields));
	}

	static get name() {
		return "FirewallPolicy";
	}

	static get tableName() {
		return "firewall_policy";
	}

	static get jsonAttributes() {
		return ["geo_countries", "allow_cidrs", "block_cidrs", "feed_urls", "feed_status"];
	}
}

export default FirewallPolicy;
