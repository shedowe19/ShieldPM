import qrcode from "qrcode";
import { generateSecret, generateURI, verifySync } from "otplib";
import errs from "../../lib/error.js";
import UserTwoFa from "../../models/user-2fa.js";
import { regenerateBackupCodes } from "./backup-codes.js";

const APP_NAME = "ShieldPM";

const setupTotp = async (userId, userEmail) => {
	const secret = generateSecret();
	const otpauthUrl = generateURI({
		secret,
		issuer: APP_NAME,
		label: userEmail,
		algorithm: "SHA1",
		digits: 6,
		period: 30,
		type: "totp",
	});
	const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

	await UserTwoFa.query().delete().where({ user_id: userId, type: "totp", is_verified: 0, is_deleted: 0 });
	await UserTwoFa.query().insert({
		user_id: userId,
		type: "totp",
		label: "Authenticator App",
		secret,
		is_verified: 0,
	});

	return { secret, otpauthUrl, qrDataUrl };
};

const verifyAndEnableTotp = async (userId, code) => {
	const record = await UserTwoFa.query().findOne({ user_id: userId, type: "totp", is_verified: 0, is_deleted: 0 });
	if (!record) {
		throw new errs.ValidationError("No pending TOTP setup found. Please restart setup.");
	}

	const isValid = verifySync({ token: code, secret: record.secret }).valid;
	if (!isValid) {
		throw new errs.ValidationError("Invalid TOTP code");
	}

	await UserTwoFa.query().patch({ is_verified: 1 }).where({ id: record.id });
	return regenerateBackupCodes(userId);
};

const verifyTotp = async (userId, code) => {
	const record = await UserTwoFa.query().findOne({ user_id: userId, type: "totp", is_verified: 1, is_deleted: 0 });
	if (!record) {
		return false;
	}
	return verifySync({ token: code, secret: record.secret }).valid;
};

export { setupTotp, verifyAndEnableTotp, verifyTotp };
