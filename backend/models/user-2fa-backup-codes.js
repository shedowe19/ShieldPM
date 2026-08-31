import bcrypt from "bcryptjs";
import { Model, transaction } from "objection";
import db from "../db.js";
import now from "./now_helper.js";
import User from "./user.js";

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
		const unused = await UserTwoFaBackupCode.query().where({ user_id: userId }).whereNull("used_at");

		for (const record of unused) {
			const matches = await bcrypt.compare(plainCode, record.code_hash);
			if (matches) {
				const consumed = await UserTwoFaBackupCode.query()
					.patch({ used_at: now() })
					.where({ id: record.id, user_id: userId })
					.whereNull("used_at");
				if (consumed === 1) {
					return record;
				}
			}
		}

		return null;
	}

	/**
	 * Replace a user's recovery-code set while holding a row lock on the user.
	 * The lock serializes concurrent regeneration across MySQL/PostgreSQL;
	 * SQLite serializes the write transaction itself.
	 * @param {number} userId
	 * @param {{user_id: number, code_hash: string}[]} rows
	 * @param {{onlyIfMissing?: boolean}} [options]
	 * @returns {Promise<boolean>} false when onlyIfMissing was set and codes exist
	 */
	static replaceForUser(userId, rows, options = {}) {
		return transaction(UserTwoFaBackupCode.knex(), async (trx) => {
			const user = await User.query(trx).findById(userId).forUpdate();
			if (!user) {
				return false;
			}

			if (options.onlyIfMissing) {
				const existingCount = await UserTwoFaBackupCode.query(trx)
					.where({ user_id: userId })
					.whereNull("used_at")
					.resultSize();
				if (existingCount > 0) {
					return false;
				}
			}

			await UserTwoFaBackupCode.query(trx).delete().where({ user_id: userId });
			for (const row of rows) {
				await UserTwoFaBackupCode.query(trx).insert(row);
			}
			return true;
		});
	}
}

export default UserTwoFaBackupCode;
