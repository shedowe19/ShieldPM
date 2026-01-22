// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import { global as logger } from "../logger.js";
import now from "./now_helper.js";
import ProxyHost from "./proxy_host.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted"];

class TorOnion extends Model {
    /** @type {number} */
    id;
    /** @type {string} */
    name;
    /** @type {number|null} */
    proxy_host_id;
    /** @type {string|null} */
    onion_address;
    /** @type {string|null} */
    private_key;
    /** @type {number} */
    virtual_port;
    /** @type {number} */
    target_port;
    /** @type {number} */
    status;
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

        if (boolJson.private_key) {
            try {
                boolJson.private_key = decrypt(boolJson.private_key);
            } catch (err) {
                // Ignore decryption errors
                logger.error("Decryption failed for tor onion private key", err);
            }
        }
        return boolJson;
    }

    $formatDatabaseJson(json) {
        const thisJson = convertBoolFieldsToInt(json, boolFields);
        if (thisJson.private_key) {
            thisJson.private_key = encrypt(thisJson.private_key);
        }
        return super.$formatDatabaseJson(thisJson);
    }

    static get name() {
        return "TorOnion";
    }

    static get tableName() {
        return "tor_onion";
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
                    from: "tor_onion.owner_user_id",
                    to: "user.id",
                },
                modify: (qb) => {
                    qb.where("user.is_deleted", 0);
                },
            },
            proxy_host: {
                relation: Model.BelongsToOneRelation,
                modelClass: ProxyHost,
                join: {
                    from: "tor_onion.proxy_host_id",
                    to: "proxy_host.id",
                },
                modify: (qb) => {
                    qb.where("proxy_host.is_deleted", 0);
                },
            },
        };
    }
}

export default TorOnion;
