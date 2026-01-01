// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import { encrypt, decrypt } from "../lib/encryption.js";
import { global as logger } from "../logger.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import db from "../db.js";
import now from "./now_helper.js";
import User from "./user.js";

Model.knex(db());

const boolFields = ["is_deleted"];

class CloudflaredTunnel extends Model {
    $beforeInsert() {
        this.created_on = now();
        this.modified_on = now();

        // Default for meta
        if (typeof this.meta === "undefined") {
            this.meta = {};
        }
    }

    $beforeUpdate() {
        this.modified_on = now();
    }

    $parseDatabaseJson(json) {
        const thisJson = super.$parseDatabaseJson(json);
        const boolJson = convertIntFieldsToBool(thisJson, boolFields);

        if (boolJson.token) {
            try {
                boolJson.token = decrypt(boolJson.token);
            } catch (err) {
                // Ignore decryption errors
                logger.error("Decryption failed for tunnel token", err);
            }
        }
        return boolJson;
    }

    $formatDatabaseJson(json) {
        const thisJson = convertBoolFieldsToInt(json, boolFields);
        if (thisJson.token) {
            thisJson.token = encrypt(thisJson.token);
        }
        return super.$formatDatabaseJson(thisJson);
    }

    static get name() {
        return "CloudflaredTunnel";
    }

    static get tableName() {
        return "cloudflared_tunnel";
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
                    from: "cloudflared_tunnel.owner_user_id",
                    to: "user.id",
                },
                modify: (qb) => {
                    qb.where("user.is_deleted", 0);
                },
            },
        };
    }
}

export default CloudflaredTunnel;

