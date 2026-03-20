import crypto from "node:crypto";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import errs from "../../lib/error.js";
import UserTwoFa from "../../models/user-2fa.js";
import userModel from "../../models/user.js";
import { ensureBackupCodesExist } from "./backup-codes.js";

const APP_NAME = "ShieldPM";
const PASSKEY_RP_ID = process.env.PASSKEY_RP_ID || null;
const PASSKEY_RP_NAME = process.env.PASSKEY_RP_NAME || APP_NAME;
const PASSKEY_ORIGIN = process.env.PASSKEY_ORIGIN || null;

const getPasskeyContext = (req) => {
	const origin = PASSKEY_ORIGIN || req.headers.origin || `${req.protocol}://${req.hostname}`;
	let rpID = PASSKEY_RP_ID;
	if (!rpID) {
		try {
			rpID = new URL(origin).hostname;
		} catch {
			rpID = req.hostname || "localhost";
		}
	}
	return { rpID, origin };
};

const beginPasskeyRegistration = async (userId, userEmail, req) => {
	const { rpID } = getPasskeyContext(req);
	const existingPasskeys = await UserTwoFa.query().where({ user_id: userId, type: "passkey", is_deleted: 0 });
	const excludeCredentials = existingPasskeys.map((pk) => ({ id: pk.secret, type: "public-key", transports: pk.transports ? pk.transports.split(",") : [] }));
	const user = await userModel.query().findById(userId);

	const options = await generateRegistrationOptions({
		rpName: PASSKEY_RP_NAME,
		rpID,
		userID: Buffer.from(String(userId)),
		userName: userEmail,
		userDisplayName: user?.name || userEmail,
		attestationType: "none",
		excludeCredentials,
		authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
	});

	const challengeId = crypto.randomUUID();
	await UserTwoFa.query().delete().where({ user_id: userId, type: "passkey_challenge", is_verified: 0 });
	await UserTwoFa.query().insert({ user_id: userId, type: "passkey_challenge", secret: challengeId, meta: { challenge: options.challenge }, is_verified: 0 });

	return { options, challengeId };
};

const completePasskeyRegistration = async (userId, challengeId, registrationResponse, req, label = "Passkey") => {
	const { rpID, origin } = getPasskeyContext(req);
	const challengeRecord = await UserTwoFa.query().findOne({ user_id: userId, type: "passkey_challenge", secret: challengeId, is_verified: 0 });
	if (!challengeRecord) {
		throw new errs.ValidationError("Passkey registration challenge not found or expired");
	}

	const expectedChallenge = challengeRecord.meta?.challenge;
	if (!expectedChallenge) {
		throw new errs.ValidationError("Invalid challenge record");
	}

	const verification = await verifyRegistrationResponse({ response: registrationResponse, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID });
	if (!verification.verified || !verification.registrationInfo) {
		throw new errs.ValidationError("Passkey registration verification failed");
	}

	const { credential } = verification.registrationInfo;
	const transports = registrationResponse.response?.transports?.join(",") || null;
	await UserTwoFa.query().insert({
		user_id: userId,
		type: "passkey",
		label,
		secret: credential.id,
		public_key: Buffer.from(credential.publicKey).toString("base64"),
		counter: credential.counter,
		transports,
		is_verified: 1,
	});
	await UserTwoFa.query().delete().where({ id: challengeRecord.id });

	const backupCodes = await ensureBackupCodesExist(userId);
	return { backupCodes };
};

const beginPasskeyAuthentication = async (userId, req) => {
	const { rpID } = getPasskeyContext(req);
	const passkeys = await UserTwoFa.query().where({ user_id: userId, type: "passkey", is_verified: 1, is_deleted: 0 });
	if (passkeys.length === 0) {
		throw new errs.ValidationError("No passkeys registered for this user");
	}

	const allowCredentials = passkeys.map((pk) => ({ id: pk.secret, type: "public-key", transports: pk.transports ? pk.transports.split(",") : [] }));
	const options = await generateAuthenticationOptions({ rpID, allowCredentials, userVerification: "preferred" });

	const challengeId = crypto.randomUUID();
	await UserTwoFa.query().delete().where({ user_id: userId, type: "passkey_auth_challenge", is_verified: 0 });
	await UserTwoFa.query().insert({ user_id: userId, type: "passkey_auth_challenge", secret: challengeId, meta: { challenge: options.challenge }, is_verified: 0 });

	return { options, challengeId };
};

const completePasskeyAuthentication = async (userId, challengeId, authResponse, req) => {
	const { rpID, origin } = getPasskeyContext(req);
	const challengeRecord = await UserTwoFa.query().findOne({ user_id: userId, type: "passkey_auth_challenge", secret: challengeId, is_verified: 0 });
	if (!challengeRecord) {
		throw new errs.ValidationError("Passkey authentication challenge not found or expired");
	}

	const expectedChallenge = challengeRecord.meta?.challenge;
	const credentialId = authResponse.id;
	const passkey = await UserTwoFa.query().findOne({ user_id: userId, type: "passkey", secret: credentialId, is_verified: 1, is_deleted: 0 });
	if (!passkey) {
		throw new errs.ValidationError("Passkey not found");
	}

	const publicKeyBuffer = Buffer.from(passkey.public_key, "base64");
	const verification = await verifyAuthenticationResponse({
		response: authResponse,
		expectedChallenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
		credential: { id: passkey.secret, publicKey: new Uint8Array(publicKeyBuffer), counter: passkey.counter, transports: passkey.transports ? passkey.transports.split(",") : [] },
	});
	if (!verification.verified) {
		throw new errs.ValidationError("Passkey authentication failed");
	}

	await UserTwoFa.query().patch({ counter: verification.authenticationInfo.newCounter }).where({ id: passkey.id });
	await UserTwoFa.query().delete().where({ id: challengeRecord.id });
	return true;
};

export { beginPasskeyAuthentication, beginPasskeyRegistration, completePasskeyAuthentication, completePasskeyRegistration, getPasskeyContext };
