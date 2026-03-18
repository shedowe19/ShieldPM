import bcrypt from "bcryptjs";
import { Model } from "objection";
import db from "../db.js";
import now from "./now_helper.js";

Model.knex(db());

class UserTwoFaBackupCode extends Model {
	/** @type {number} */
	id;
	/** @type {number} */
	user_id;
	/** @type {string} */
	code_hash;
	/** @type {string|null} */
	used_at;
	/** @type {string} */
	created_on;

	$beforeInsert() {
		this.created_on = /** @type {any} */ (now());
	}

	static get name() {
		return "UserTwoFaBackupCode";
	}

	static get tableName() {
		return "user_2fa_backup_codes";
	}

	/**
	 * Find an unused backup code for a user that matches the plaintext code.
	 * @param {number} userId
	 * @param {string} plainCode
	 * @returns {Promise<UserTwoFaBackupCode|null>}
	 */
	static async findAndConsume(userId, plainCode) {
		const unused = await UserTwoFaBackupCode.query()
			.where({ user_id: userId })
			.whereNull("used_at");

		for (const record of unused) {
			const matches = await bcrypt.compare(plainCode, record.code_hash);
			if (matches) {
				await UserTwoFaBackupCode.query()
					.patch({ used_at: now() })
					.where({ id: record.id });
				return record;
			}
		}

		return null;
	}
}

export default UserTwoFaBackupCode;
