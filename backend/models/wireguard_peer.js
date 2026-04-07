// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import { global as logger } from "../logger.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted"];

class WireguardPeer extends Model {
	/** @type {number} */
	id;
	/** @type {string} */
	name;
	/** @type {string|null} */
	description;
	/** @type {string} */
	client_address;
	/** @type {string} */
	client_public_key;
	/** @type {string} */
	client_private_key;
	/** @type {string} */
	preshared_key;
	/** @type {string} */
	server_public_key;
	/** @type {string|null} */
	endpoint;
	/** @type {string} */
	allowed_ips;
	/** @type {number} */
	persistent_keepalive;
	/** @type {string|null} */
	dns;
	/** @type {number} */
	status;
	/** @type {string|null} */
	last_handshake;
	/** @type {number} */
	transfer_rx;
	/** @type {number} */
	transfer_tx;
	/** @type {string} */
	created_on;
	/** @type {string} */
	modified_on;
	/** @type {Object} */
	meta;
	/** @type {number} */
	is_deleted;
	/** @type {number} */
	owner_user_id;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
		this.modified_on = /** @type {any} */ (now());

		// Default for meta
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = /** @type {any} */ (now());
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		const boolJson = convertIntFieldsToBool(thisJson, boolFields);

		// Decrypt sensitive fields
		if (boolJson.client_private_key) {
			try {
				boolJson.client_private_key = decrypt(boolJson.client_private_key);
			} catch (err) {
				logger.error("Decryption failed for wireguard client_private_key", err);
			}
		}
		if (boolJson.preshared_key) {
			try {
				boolJson.preshared_key = decrypt(boolJson.preshared_key);
			} catch (err) {
				logger.error("Decryption failed for wireguard preshared_key", err);
			}
		}

		// Ensure last_handshake is a proper ISO-8601 string for the frontend
		if (boolJson.last_handshake && !boolJson.last_handshake.includes("Z")) {
			// Replace space with T and append Z to mark it as UTC
			boolJson.last_handshake = boolJson.last_handshake.replace(" ", "T") + "Z";
		}

		return boolJson;
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		// Encrypt sensitive fields
		if (thisJson.client_private_key) {
			thisJson.client_private_key = encrypt(thisJson.client_private_key);
		}
		if (thisJson.preshared_key) {
			thisJson.preshared_key = encrypt(thisJson.preshared_key);
		}
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "WireguardPeer";
	}

	static get tableName() {
		return "wireguard_peer";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "wireguard_peer.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
		};
	}
}

export default WireguardPeer;
