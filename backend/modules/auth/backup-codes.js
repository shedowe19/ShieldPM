import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import UserTwoFaBackupCode from "../../models/user-2fa-backup-codes.js";

const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 10;

const generateBackupCode = () =>
	crypto
		.randomBytes(8)
		.toString("base64url")
		.replace(/[^a-zA-Z0-9]/g, "")
		.slice(0, BACKUP_CODE_LENGTH)
		.toUpperCase();

const regenerateBackupCodes = async (userId) => {
	await UserTwoFaBackupCode.query().delete().where({ user_id: userId });

	const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
	const rows = await Promise.all(
		codes.map(async (code) => ({
			user_id: userId,
			code_hash: await bcrypt.hash(code, 10),
		})),
	);

	await Promise.all(rows.map((row) => UserTwoFaBackupCode.query().insert(row)));
	return codes;
};

const ensureBackupCodesExist = async (userId) => {
	const count = await UserTwoFaBackupCode.query().where({ user_id: userId }).whereNull("used_at").resultSize();
	if (count === 0) {
		return regenerateBackupCodes(userId);
	}
	return null;
};

const verifyBackupCode = async (userId, code) => {
	const record = await UserTwoFaBackupCode.findAndConsume(userId, code.toUpperCase().replace(/[\s-]/g, ""));
	return !!record;
};

const getRemainingBackupCodeCount = async (userId) => {
	return UserTwoFaBackupCode.query().where({ user_id: userId }).whereNull("used_at").resultSize();
};

export { ensureBackupCodesExist, getRemainingBackupCodeCount, regenerateBackupCodes, verifyBackupCode };
