import errs from "../../lib/error.js";
import UserTwoFa from "../../models/user-2fa.js";
import UserTwoFaBackupCode from "../../models/user-2fa-backup-codes.js";
import { beginDuoAuthentication, completeDuoAuthentication, setupDuo } from "./duo.js";
import { ensureBackupCodesExist, getRemainingBackupCodeCount, regenerateBackupCodes, verifyBackupCode } from "./backup-codes.js";
import { beginPasskeyAuthentication, beginPasskeyRegistration, completePasskeyAuthentication, completePasskeyRegistration } from "./passkeys.js";
import { setupTotp, verifyAndEnableTotp, verifyTotp } from "./totp.js";
import { addYubikey, verifyYubikey } from "./yubikey.js";

const removeTwoFaMethod = async (userId, methodId) => {
	const record = await UserTwoFa.query().findOne({ id: methodId, user_id: userId, is_deleted: 0 });
	if (!record) {
		throw new errs.ItemNotFoundError(`2FA method ${methodId}`);
	}

	const activeCount = await UserTwoFa.query().where({ user_id: userId, is_verified: 1, is_deleted: 0 }).resultSize();
	await UserTwoFa.query().patch({ is_deleted: 1 }).where({ id: methodId });
	if (activeCount <= 1) {
		await UserTwoFaBackupCode.query().delete().where({ user_id: userId });
	}
};

const verifyLoginChallenge = async (userId, method, code) => {
	switch (method) {
		case "totp":
			return verifyTotp(userId, code);
		case "yubikey":
			return verifyYubikey(userId, code);
		case "backup_code":
			return verifyBackupCode(userId, code);
		default:
			throw new errs.ValidationError(`Unknown 2FA method: ${method}`);
	}
};

export default {
	setupTotp,
	verifyAndEnableTotp,
	verifyTotp,
	addYubikey,
	verifyYubikey,
	beginPasskeyRegistration,
	completePasskeyRegistration,
	beginPasskeyAuthentication,
	completePasskeyAuthentication,
	setupDuo,
	beginDuoAuthentication,
	completeDuoAuthentication,
	regenerateBackupCodes,
	ensureBackupCodesExist,
	verifyBackupCode,
	getRemainingBackupCodeCount,
	removeTwoFaMethod,
	verifyLoginChallenge,
};
