import crypto from "node:crypto";
import https from "node:https";
import errs from "../../lib/error.js";
import UserTwoFa from "../../models/user-2fa.js";
import { ensureBackupCodesExist } from "./backup-codes.js";

const validateYubikeyOtp = (otp) => {
	if (typeof otp !== "string" || otp.length < 32) {
		return Promise.reject(new errs.ValidationError("Invalid YubiKey OTP format"));
	}

	const clientId = process.env.YUBICO_CLIENT_ID || "1";
	const apiUrl = process.env.YUBICO_API_URL || "api.yubico.com";
	const nonce = crypto.randomBytes(16).toString("hex");
	const deviceId = otp.slice(0, 12);

	return new Promise((resolve, reject) => {
		const params = new URLSearchParams({ id: clientId, nonce, otp, sl: "secure", timestamp: "1" });
		const path = `/wsapi/2.0/verify?${params.toString()}`;

		const req = https.request({ hostname: apiUrl, path, method: "GET" }, (res) => {
			let body = "";
			res.on("data", (chunk) => {
				body += chunk;
			});
			res.on("end", () => {
				const statusMatch = body.match(/status=(\w+)/);
				if (!statusMatch) {
					return reject(new errs.ValidationError("Unexpected Yubico API response"));
				}
				const status = statusMatch[1];
				if (status !== "OK") {
					return reject(new errs.ValidationError(`YubiKey validation failed: ${status}`));
				}
				resolve({ status, deviceId });
			});
		});

		req.on("error", (err) => reject(new errs.InternalError(`Yubico API request failed: ${err.message}`)));
		req.end();
	});
};

const addYubikey = async (userId, otp, label = "YubiKey") => {
	const { deviceId } = await validateYubikeyOtp(otp);
	const existing = await UserTwoFa.query().findOne({
		user_id: userId,
		type: "yubikey",
		secret: deviceId,
		is_deleted: 0,
	});
	if (existing) {
		throw new errs.ValidationError("This YubiKey is already registered");
	}

	const record = await UserTwoFa.query().insertAndFetch({
		user_id: userId,
		type: "yubikey",
		label,
		secret: deviceId,
		is_verified: 1,
	});

	await ensureBackupCodesExist(userId);
	return record;
};

const verifyYubikey = async (userId, otp) => {
	const { deviceId } = await validateYubikeyOtp(otp);
	const record = await UserTwoFa.query().findOne({
		user_id: userId,
		type: "yubikey",
		secret: deviceId,
		is_verified: 1,
		is_deleted: 0,
	});
	return !!record;
};

export { addYubikey, validateYubikeyOtp, verifyYubikey };
