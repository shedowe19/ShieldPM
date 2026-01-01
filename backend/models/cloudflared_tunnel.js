import { global as logger } from "../logger.js";
import { Model } from "objection";
import { encrypt, decrypt } from "../lib/encryption.js";
import BaseModel from "./base.js";

class CloudflaredTunnel extends BaseModel {
	// ...
	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		if (thisJson.token) {
			try {
				thisJson.token = decrypt(thisJson.token);
			} catch (err) {
				// Ignore decryption errors, maybe it was not encrypted or key changed
				logger.error("Decryption failed for tunnel token", err);
			}
		}
		return thisJson;
	}

	$formatDatabaseJson(json) {
		const thisJson = super.$formatDatabaseJson(json);
		if (thisJson.token) {
			thisJson.token = encrypt(thisJson.token);
		}
		return thisJson;
	}
}

export default CloudflaredTunnel;
