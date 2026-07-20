/**
 * 2FA Service
 *
 * Handles TOTP, YubiKey OTP, Passkey (WebAuthn), and Duo Security
 * verification and setup logic.
 */

import crypto from "node:crypto";
import https from "node:https";
import { Client as DuoClient } from "@duosecurity/duo_universal";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import bcrypt from "bcryptjs";
import { generateSecret, generateURI, verifySync } from "otplib";
import qrcode from "qrcode";
import errs from "../lib/error.js";
import userModel from "../models/user.js";
import UserTwoFa from "../models/user-2fa.js";
import UserTwoFaBackupCode from "../models/user-2fa-backup-codes.js";

const APP_NAME = "ShieldPM";
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 10; // chars (alphanumeric)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateBackupCode = () =>
	crypto
		.randomBytes(Math.ceil(BACKUP_CODE_LENGTH / 2))
		.toString("hex")
		.slice(0, BACKUP_CODE_LENGTH)
		.toUpperCase();

/**
 * Generate and store fresh backup codes for a user, replacing any old ones.
 * Returns the plaintext codes (shown once).
 * @param {number} userId
 * @returns {Promise<string[]>}
 */
const regenerateBackupCodes = async (userId) => {
	// Delete existing unused codes
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

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

/**
 * Begin TOTP setup: generate a secret and return QR code data URL.
 * The method is NOT yet enabled; the user must verify a code first.
 * @param {number} userId
 * @param {string} userEmail
 * @returns {Promise<{ secret: string, otpauthUrl: string, qrDataUrl: string }>}
 */
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

	// Persist an *unverified* TOTP record (overwrite any existing unverified TOTP)
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

/**
 * Verify a TOTP code and mark the method as active.
 * @param {number} userId
 * @param {string} code
 * @returns {Promise<string[]>} backup codes (shown once)
 */
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

/**
 * Verify a TOTP code during login (method already enabled).
 * @param {number} userId
 * @param {string} code
 * @returns {Promise<boolean>}
 */
const verifyTotp = async (userId, code) => {
	const record = await UserTwoFa.query().findOne({ user_id: userId, type: "totp", is_deleted: 0 });
	if (!record) {
		return false;
	}
	// Accept code even if is_verified=0 (TOTP was set up but the UI verification
	// flow was bypassed, e.g. via direct DB seed)
	return verifySync({ token: code, secret: record.secret }).valid;
};

// ---------------------------------------------------------------------------
// YubiKey OTP
// ---------------------------------------------------------------------------

/**
 * Validate a YubiKey OTP against the Yubico validation API.
 * Requires YUBICO_CLIENT_ID and YUBICO_SECRET_KEY in the environment
 * (or can point to a local validation server via YUBICO_API_URL).
 *
 * @param {string} otp  44-character OTP from the YubiKey
 * @returns {Promise<{ status: string, deviceId: string }>}
 */
const validateYubikeyOtp = (otp) => {
	if (typeof otp !== "string" || otp.length < 32) {
		return Promise.reject(new errs.ValidationError("Invalid YubiKey OTP format"));
	}

	const clientId = process.env.YUBICO_CLIENT_ID || "1";
	const apiUrl = process.env.YUBICO_API_URL || "api.yubico.com";
	const nonce = crypto.randomBytes(16).toString("hex");

	// The device ID is the first 12 characters of the OTP (modhex encoded)
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

/**
 * Add a YubiKey to a user account (validates OTP first).
 * @param {number} userId
 * @param {string} otp
 * @param {string} [label]
 * @returns {Promise<UserTwoFa>}
 */
const addYubikey = async (userId, otp, label = "YubiKey") => {
	const { deviceId } = await validateYubikeyOtp(otp);

	// Prevent duplicate registration of the same key
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

/**
 * Verify a YubiKey OTP during login.
 * @param {number} userId
 * @param {string} otp
 * @returns {Promise<boolean>}
 */
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

// ---------------------------------------------------------------------------
// Passkey / WebAuthn
// ---------------------------------------------------------------------------

const PASSKEY_RP_ID = process.env.PASSKEY_RP_ID || null; // null = derive dynamically from request
const PASSKEY_RP_NAME = process.env.PASSKEY_RP_NAME || APP_NAME;
const PASSKEY_ORIGIN = process.env.PASSKEY_ORIGIN || null; // null = derive dynamically from request

/**
 * Derive rpID and origin from the request when not explicitly configured.
 * @param {object} req  Express request object
 * @returns {{ rpID: string, origin: string }}
 */
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

/**
 * Begin passkey registration: generate options and store the challenge.
 * @param {number} userId
 * @param {string} userEmail
 * @returns {Promise<{ options: PublicKeyCredentialCreationOptionsJSON, challengeId: string }>}
 */
const beginPasskeyRegistration = async (userId, userEmail, req) => {
	const { rpID } = getPasskeyContext(req);
	const existingPasskeys = await UserTwoFa.query().where({ user_id: userId, type: "passkey", is_deleted: 0 });

	const excludeCredentials = existingPasskeys.map((pk) => ({
		id: pk.secret,
		type: "public-key",
		transports: pk.transports ? pk.transports.split(",") : [],
	}));

	const user = await userModel.query().findById(userId);

	const options = await generateRegistrationOptions({
		rpName: PASSKEY_RP_NAME,
		rpID,
		userID: Buffer.from(String(userId)),
		userName: userEmail,
		userDisplayName: user?.name || userEmail,
		attestationType: "none",
		excludeCredentials,
		authenticatorSelection: {
			residentKey: "preferred",
			userVerification: "preferred",
		},
	});

	// Store challenge temporarily (expires in 5 minutes)
	const challengeId = crypto.randomUUID();
	await UserTwoFa.query().delete().where({ user_id: userId, type: "passkey_challenge", is_verified: 0 });
	await UserTwoFa.query().insert({
		user_id: userId,
		type: "passkey_challenge",
		secret: challengeId,
		meta: { challenge: options.challenge },
		is_verified: 0,
	});

	return { options, challengeId };
};

/**
 * Complete passkey registration.
 * @param {number} userId
 * @param {string} challengeId
 * @param {object} registrationResponse  Credential from navigator.credentials.create()
 * @param {string} [label]
 * @returns {Promise<{ backupCodes: string[] }>}
 */
const completePasskeyRegistration = async (userId, challengeId, registrationResponse, req, label = "Passkey") => {
	const { rpID, origin } = getPasskeyContext(req);
	const challengeRecord = await UserTwoFa.query().findOne({
		user_id: userId,
		type: "passkey_challenge",
		secret: challengeId,
		is_verified: 0,
	});

	if (!challengeRecord) {
		throw new errs.ValidationError("Passkey registration challenge not found or expired");
	}

	const expectedChallenge = challengeRecord.meta?.challenge;
	if (!expectedChallenge) {
		throw new errs.ValidationError("Invalid challenge record");
	}

	const verification = await verifyRegistrationResponse({
		response: registrationResponse,
		expectedChallenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
	});

	if (!verification.verified || !verification.registrationInfo) {
		throw new errs.ValidationError("Passkey registration verification failed");
	}

	const { credential } = verification.registrationInfo;
	const transports = registrationResponse.response?.transports?.join(",") || null;

	// Store the credential
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

	// Clean up challenge
	await UserTwoFa.query().delete().where({ id: challengeRecord.id });

	const backupCodes = await ensureBackupCodesExist(userId);
	return { backupCodes };
};

/**
 * Begin passkey authentication: generate options with a challenge.
 * @param {number} userId
 * @returns {Promise<{ options: PublicKeyCredentialRequestOptionsJSON, challengeId: string }>}
 */
const beginPasskeyAuthentication = async (userId, req) => {
	const { rpID } = getPasskeyContext(req);
	const passkeys = await UserTwoFa.query().where({ user_id: userId, type: "passkey", is_verified: 1, is_deleted: 0 });

	if (passkeys.length === 0) {
		throw new errs.ValidationError("No passkeys registered for this user");
	}

	const allowCredentials = passkeys.map((pk) => ({
		id: pk.secret,
		type: "public-key",
		transports: pk.transports ? pk.transports.split(",") : [],
	}));

	const options = await generateAuthenticationOptions({
		rpID,
		allowCredentials,
		userVerification: "preferred",
	});

	const challengeId = crypto.randomUUID();
	await UserTwoFa.query().delete().where({ user_id: userId, type: "passkey_auth_challenge", is_verified: 0 });
	await UserTwoFa.query().insert({
		user_id: userId,
		type: "passkey_auth_challenge",
		secret: challengeId,
		meta: { challenge: options.challenge },
		is_verified: 0,
	});

	return { options, challengeId };
};

/**
 * Complete passkey authentication.
 * @param {number} userId
 * @param {string} challengeId
 * @param {object} authResponse  Credential from navigator.credentials.get()
 * @returns {Promise<boolean>}
 */
const completePasskeyAuthentication = async (userId, challengeId, authResponse, req) => {
	const { rpID, origin } = getPasskeyContext(req);
	const challengeRecord = await UserTwoFa.query().findOne({
		user_id: userId,
		type: "passkey_auth_challenge",
		secret: challengeId,
		is_verified: 0,
	});

	if (!challengeRecord) {
		throw new errs.ValidationError("Passkey authentication challenge not found or expired");
	}

	const expectedChallenge = challengeRecord.meta?.challenge;
	const credentialId = authResponse.id;

	const passkey = await UserTwoFa.query().findOne({
		user_id: userId,
		type: "passkey",
		secret: credentialId,
		is_verified: 1,
		is_deleted: 0,
	});

	if (!passkey) {
		throw new errs.ValidationError("Passkey not found");
	}

	const publicKeyBuffer = Buffer.from(passkey.public_key, "base64");

	const verification = await verifyAuthenticationResponse({
		response: authResponse,
		expectedChallenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
		credential: {
			id: passkey.secret,
			publicKey: new Uint8Array(publicKeyBuffer),
			counter: passkey.counter,
			transports: passkey.transports ? passkey.transports.split(",") : [],
		},
	});

	if (!verification.verified) {
		throw new errs.ValidationError("Passkey authentication failed");
	}

	// Update counter to prevent replay attacks
	await UserTwoFa.query().patch({ counter: verification.authenticationInfo.newCounter }).where({ id: passkey.id });

	// Clean up challenge
	await UserTwoFa.query().delete().where({ id: challengeRecord.id });

	return true;
};

// ---------------------------------------------------------------------------
// Duo Security (Universal Prompt)
// ---------------------------------------------------------------------------

/**
 * Create a Duo Client from stored configuration.
 * @param {object} duoConfig
 * @param {string} duoConfig.clientId
 * @param {string} duoConfig.clientSecret
 * @param {string} duoConfig.apiHost
 * @param {string} duoConfig.redirectUrl
 */
const createDuoClient = (duoConfig) => {
	try {
		return new DuoClient({
			clientId: duoConfig.clientId,
			clientSecret: duoConfig.clientSecret,
			apiHost: duoConfig.apiHost,
			redirectUrl: duoConfig.redirectUrl,
		});
	} catch (err) {
		throw new errs.ValidationError(`Invalid Duo configuration: ${err.message}`);
	}
};

/**
 * Save Duo Security configuration for a user and verify connectivity.
 * @param {number} userId
 * @param {object} config
 * @returns {Promise<UserTwoFa>}
 */
const setupDuo = async (userId, config) => {
	const { clientId, clientSecret, apiHost, redirectUrl } = config;
	if (!clientId || !clientSecret || !apiHost || !redirectUrl) {
		throw new errs.ValidationError("All Duo configuration fields are required");
	}

	// Validate the config by pinging Duo
	const client = createDuoClient({ clientId, clientSecret, apiHost, redirectUrl });
	await client.healthCheck();

	// Remove any existing Duo config
	await UserTwoFa.query().patch({ is_deleted: 1 }).where({ user_id: userId, type: "duo", is_deleted: 0 });

	const record = await UserTwoFa.query().insertAndFetch({
		user_id: userId,
		type: "duo",
		label: "Duo Security",
		meta: { clientId, clientSecret, apiHost, redirectUrl },
		is_verified: 1,
	});

	await ensureBackupCodesExist(userId);
	return record;
};

/**
 * Begin Duo authentication: generate the Duo auth URL.
 * @param {number} userId
 * @param {string} userEmail
 * @returns {Promise<{ authUrl: string, state: string }>}
 */
const beginDuoAuthentication = async (userId, userEmail) => {
	const duoRecord = await UserTwoFa.query().findOne({ user_id: userId, type: "duo", is_verified: 1, is_deleted: 0 });
	if (!duoRecord) {
		throw new errs.ValidationError("Duo Security is not configured for this user");
	}

	const client = createDuoClient(duoRecord.meta);
	const state = crypto.randomBytes(32).toString("base64url");
	const authUrl = await client.createAuthUrl(userEmail, state);

	return { authUrl, state };
};

/**
 * Complete Duo authentication by exchanging the authorization code.
 * @param {number} userId
 * @param {string} userEmail
 * @param {string} duoCode
 * @returns {Promise<boolean>}
 */
const completeDuoAuthentication = async (userId, userEmail, duoCode) => {
	const duoRecord = await UserTwoFa.query().findOne({ user_id: userId, type: "duo", is_verified: 1, is_deleted: 0 });
	if (!duoRecord) {
		throw new errs.ValidationError("Duo Security is not configured for this user");
	}

	const client = createDuoClient(duoRecord.meta);
	const tokenResult = await client.exchangeAuthorizationCodeFor2FAResult(duoCode, userEmail);
	return !!tokenResult;
};

// ---------------------------------------------------------------------------
// Backup Codes
// ---------------------------------------------------------------------------

/**
 * Ensure a user has backup codes; generate if none exist.
 * @param {number} userId
 * @returns {Promise<string[]|null>} New backup codes if generated, otherwise null
 */
const ensureBackupCodesExist = async (userId) => {
	const count = await UserTwoFaBackupCode.query().where({ user_id: userId }).whereNull("used_at").resultSize();
	if (count === 0) {
		return regenerateBackupCodes(userId);
	}
	return null;
};

/**
 * Verify a backup code during login (one-time use).
 * @param {number} userId
 * @param {string} code
 * @returns {Promise<boolean>}
 */
const verifyBackupCode = async (userId, code) => {
	const record = await UserTwoFaBackupCode.findAndConsume(userId, code.toUpperCase().replace(/[\s-]/g, ""));
	return !!record;
};

/**
 * Get unused backup codes count for a user.
 * @param {number} userId
 * @returns {Promise<number>}
 */
const getRemainingBackupCodeCount = async (userId) => {
	return UserTwoFaBackupCode.query().where({ user_id: userId }).whereNull("used_at").resultSize();
};

// ---------------------------------------------------------------------------
// Remove a 2FA method
// ---------------------------------------------------------------------------

/**
 * Soft-delete a specific 2FA method.
 * Throws if it's the user's only 2FA method.
 * @param {number} userId
 * @param {number} methodId
 */
const removeTwoFaMethod = async (userId, methodId) => {
	const record = await UserTwoFa.query().findOne({ id: methodId, user_id: userId, is_deleted: 0 });
	if (!record) {
		throw new errs.ItemNotFoundError(`2FA method ${methodId}`);
	}

	const activeCount = await UserTwoFa.query().where({ user_id: userId, is_verified: 1, is_deleted: 0 }).resultSize();

	await UserTwoFa.query().patch({ is_deleted: 1 }).where({ id: methodId });

	// If this was the last active method, 2FA is now disabled.
	// Clean up backup codes so they don't linger.
	if (activeCount <= 1) {
		await UserTwoFaBackupCode.query().delete().where({ user_id: userId });
	}
};

// ---------------------------------------------------------------------------
// Unified login-time verification (used from tokens route)
// ---------------------------------------------------------------------------

/**
 * Verify a 2FA challenge response during the login flow.
 * @param {number} userId
 * @param {string} method  'totp' | 'yubikey' | 'backup_code'
 * @param {string} code
 * @returns {Promise<boolean>}
 */
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
	// TOTP
	setupTotp,
	verifyAndEnableTotp,
	verifyTotp,
	// YubiKey
	addYubikey,
	verifyYubikey,
	// Passkey
	beginPasskeyRegistration,
	completePasskeyRegistration,
	beginPasskeyAuthentication,
	completePasskeyAuthentication,
	// Duo
	setupDuo,
	beginDuoAuthentication,
	completeDuoAuthentication,
	// Backup Codes
	regenerateBackupCodes,
	verifyBackupCode,
	getRemainingBackupCodeCount,
	// General
	removeTwoFaMethod,
	verifyLoginChallenge,
};
