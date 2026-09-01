/**
 * 2FA Service
 *
 * Handles TOTP, YubiKey OTP, Passkey (WebAuthn), Duo Security, and recovery
 * code verification. Browser challenges are bound to their user, purpose,
 * and parent session and are consumed atomically.
 */

import crypto from "node:crypto";
import https from "node:https";
import { Client as DuoClient, constants as duoConstants } from "@duosecurity/duo_universal";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import bcrypt from "bcryptjs";
import { generateSecret, generateURI, verifySync } from "otplib";
import qrcode from "qrcode";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import userModel from "../models/user.js";
import UserTwoFa from "../models/user-2fa.js";
import UserTwoFaBackupCode from "../models/user-2fa-backup-codes.js";
import UserTwoFaChallenge from "../models/user-2fa-challenge.js";

const APP_NAME = "ShieldPM";
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 10;
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const YUBICO_RESPONSE_MAX_BYTES = 16 * 1024;
const YUBICO_TIMEOUT_MS = 5_000;
const SECRET_PREFIX = "enc:v1:";

const PURPOSE_LOGIN = "login";
const PURPOSE_STEP_UP = "step_up";
const PURPOSE_ENROLLMENT = "mfa_enrollment";

const REAL_METHOD_TYPES = ["totp", "yubikey", "passkey", "duo"];
// A Yubico OTP consists of a 1-16 character public ID plus a 32 character
// encrypted payload. Keys without a public ID cannot be mapped to an account.
const YUBIKEY_MODHEX_PATTERN = /^[cbdefghijklnrtuv]{33,48}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

// ---------------------------------------------------------------------------
// General helpers
// ---------------------------------------------------------------------------

const hashValue = (domain, value) => crypto.createHash("sha256").update(`${domain}\0${value}`, "utf8").digest("hex");

const protectSecret = (value) => `${SECRET_PREFIX}${encrypt(value)}`;

const revealSecret = (value) => {
	if (typeof value !== "string" || value.length === 0) {
		throw new errs.InternalError("Stored MFA secret is missing");
	}
	return value.startsWith(SECRET_PREFIX) ? decrypt(value.slice(SECRET_PREFIX.length)) : value;
};

const isUniqueViolation = (err) => {
	const code = err?.nativeError?.code || err?.code;
	return (
		err?.name === "UniqueViolationError" ||
		code === "23505" ||
		code === "ER_DUP_ENTRY" ||
		code === "SQLITE_CONSTRAINT"
	);
};

const normalizeLabel = (label, fallback) => {
	if (typeof label !== "string" || !label.trim()) {
		return fallback;
	}
	return label.trim().slice(0, 255);
};

const getBearerToken = (req) => {
	const authorization = req?.headers?.authorization;
	if (typeof authorization !== "string") {
		return null;
	}
	const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
	return match?.[1] || null;
};

/**
 * Extract a trusted parent credential from the current request. Login MFA is
 * bound to its pending token; authenticated enrollment is bound to the access
 * token that initiated it.
 * @param {any} req
 * @returns {string}
 */
const getRequestBindingToken = (req) => {
	const explicit = req?.bindingToken;
	const internalBinding = req?.sessionBinding;
	const pendingToken = req?.body?.pending_token;
	const bearerToken = getBearerToken(req);
	const cookieToken = req?.cookies?.["__Host-shieldpm_jwt"] || req?.cookies?.shieldpm_jwt;
	const token = explicit || internalBinding || pendingToken || bearerToken || cookieToken;

	if (typeof token !== "string" || token.length < 16 || token.length > 16_384) {
		throw new errs.UnauthorizedError("MFA operation is not bound to a valid session");
	}

	return token;
};

const getSessionBinding = (req) => hashValue("shieldpm:mfa-session:v1", getRequestBindingToken(req));

const buildFlowKey = (userId, purpose, sessionBinding) =>
	hashValue("shieldpm:mfa-flow:v1", `${userId}\0${purpose}\0${sessionBinding}`);

const getAuthenticationPurpose = (context) => {
	const purpose = context?.purpose || PURPOSE_LOGIN;
	if (![PURPOSE_LOGIN, PURPOSE_STEP_UP].includes(purpose)) {
		throw new errs.ValidationError("Invalid MFA challenge purpose");
	}
	return purpose;
};

const pruneOldChallenges = async () => {
	const retentionCutoff = new Date(Date.now() - CHALLENGE_RETENTION_MS);
	await UserTwoFaChallenge.query().delete().where("expires_at", "<", retentionCutoff);
};

/**
 * Store a bound MFA challenge and return its bearer ID. The ID itself is only
 * returned to the browser; the database stores a digest.
 * @param {any} data
 * @returns {Promise<string>}
 */
const createBoundChallenge = async ({
	userId,
	type,
	purpose,
	req,
	challenge,
	rpID = null,
	origin = null,
	singleUseFlow = false,
}) => {
	const sessionBinding = getSessionBinding(req);
	const challengeId = crypto.randomBytes(32).toString("base64url");
	const flowKey = singleUseFlow ? buildFlowKey(userId, purpose, sessionBinding) : null;

	await pruneOldChallenges();

	try {
		await UserTwoFaChallenge.query().insert(
			/** @type {any} */ ({
				user_id: userId,
				challenge_id_hash: UserTwoFaChallenge.hashChallengeId(challengeId),
				type,
				purpose,
				session_binding: sessionBinding,
				flow_key: flowKey,
				challenge,
				rp_id: rpID,
				origin,
				expires_at: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
				consumed_at: null,
			}),
		);
	} catch (err) {
		if (singleUseFlow && isUniqueViolation(err)) {
			throw new errs.UnauthorizedError("This MFA sign-in attempt has already been used. Start sign-in again.");
		}
		throw err;
	}

	return challengeId;
};

/**
 * Resolve and atomically consume a bound challenge.
 * @param {any} data
 * @returns {Promise<UserTwoFaChallenge>}
 */
const consumeBoundChallenge = async ({ userId, challengeId, type, purpose, req }) => {
	if (typeof challengeId !== "string" || challengeId.length < 32 || challengeId.length > 256) {
		throw new errs.ValidationError("MFA challenge not found or expired");
	}

	const sessionBinding = getSessionBinding(req);
	const challengeIdHash = UserTwoFaChallenge.hashChallengeId(challengeId);
	const record = await UserTwoFaChallenge.query()
		.findOne({
			user_id: userId,
			challenge_id_hash: challengeIdHash,
			type,
			purpose,
			session_binding: sessionBinding,
		})
		.whereNull("consumed_at");

	if (!record?.expires_at || new Date(record.expires_at).getTime() <= Date.now()) {
		throw new errs.ValidationError("MFA challenge not found or expired");
	}

	const claimed = await UserTwoFaChallenge.query()
		.patch(/** @type {any} */ ({ consumed_at: new Date() }))
		.where({
			id: record.id,
			user_id: userId,
			challenge_id_hash: challengeIdHash,
			session_binding: sessionBinding,
		})
		.whereNull("consumed_at")
		.where("expires_at", ">", new Date());

	if (claimed !== 1) {
		throw new errs.ValidationError("MFA challenge not found or expired");
	}

	return record;
};

// ---------------------------------------------------------------------------
// Backup code generation
// ---------------------------------------------------------------------------

const generateBackupCode = () =>
	crypto
		.randomBytes(Math.ceil(BACKUP_CODE_LENGTH / 2))
		.toString("hex")
		.slice(0, BACKUP_CODE_LENGTH)
		.toUpperCase();

/**
 * Generate and atomically store fresh backup codes for a user.
 * @param {number} userId
 * @param {boolean} [onlyIfMissing]
 * @returns {Promise<string[]|null>}
 */
const generateAndStoreBackupCodes = async (userId, onlyIfMissing = false) => {
	const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
	const rows = await Promise.all(
		codes.map(async (code) => ({
			user_id: userId,
			code_hash: await bcrypt.hash(code, 10),
		})),
	);

	const replaced = await UserTwoFaBackupCode.replaceForUser(userId, rows, { onlyIfMissing });
	return replaced ? codes : null;
};

/**
 * Replace all backup codes. Concurrent replacements are serialized per user.
 * @param {number} userId
 * @returns {Promise<string[]>}
 */
const regenerateBackupCodes = async (userId) => {
	const codes = await generateAndStoreBackupCodes(userId, false);
	if (!codes) {
		throw new errs.InternalError("Failed to regenerate backup codes");
	}
	return codes;
};

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

/**
 * Begin TOTP setup. The pending record is session-bound and expires after five
 * minutes; the plaintext secret is returned only so the route can render a QR.
 * @param {number} userId
 * @param {string} userEmail
 * @param {any} req
 * @returns {Promise<{ secret: string, otpauthUrl: string, qrDataUrl: string }>}
 */
const setupTotp = async (userId, userEmail, req) => {
	const sessionBinding = getSessionBinding(req);
	const secret = generateSecret();
	const otpauthUrl = generateURI({
		secret,
		issuer: APP_NAME,
		label: userEmail,
		algorithm: "sha1",
		digits: 6,
		period: 30,
		strategy: "totp",
	});
	const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

	await UserTwoFa.query().insert(
		/** @type {any} */ ({
			user_id: userId,
			type: "totp",
			label: "Authenticator App",
			secret: protectSecret(secret),
			meta: {
				purpose: PURPOSE_ENROLLMENT,
				sessionBinding,
				expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS).toISOString(),
			},
			is_verified: 0,
		}),
	);

	return { secret, otpauthUrl, qrDataUrl };
};

/**
 * Verify and atomically activate a pending TOTP enrollment.
 * @param {number} userId
 * @param {string} code
 * @param {any} req
 * @returns {Promise<string[]|null>}
 */
const verifyAndEnableTotp = async (userId, code, req) => {
	if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
		throw new errs.ValidationError("Invalid TOTP code");
	}

	const sessionBinding = getSessionBinding(req);
	const pendingRecords = await UserTwoFa.query().where({
		user_id: userId,
		type: "totp",
		is_verified: 0,
		is_deleted: 0,
	});
	const record = [...pendingRecords]
		.sort((a, b) => Number(b.id) - Number(a.id))
		.find(
			(item) =>
				item.meta?.purpose === PURPOSE_ENROLLMENT &&
				item.meta?.sessionBinding === sessionBinding &&
				new Date(item.meta?.expiresAt).getTime() > Date.now(),
		);

	if (!record) {
		throw new errs.ValidationError("No pending TOTP setup found. Please restart setup.");
	}

	let valid = false;
	try {
		valid = verifySync({ token: code, secret: revealSecret(record.secret) }).valid;
	} catch {
		valid = false;
	}
	if (!valid) {
		throw new errs.ValidationError("Invalid TOTP code");
	}

	const enabled = await UserTwoFa.query()
		.patch(/** @type {any} */ ({ is_verified: 1, meta: {} }))
		.where({ id: record.id, user_id: userId, is_verified: 0, is_deleted: 0 });
	if (enabled !== 1) {
		throw new errs.ValidationError("TOTP setup has already been used. Please restart setup.");
	}

	await UserTwoFa.query()
		.patch(/** @type {any} */ ({ is_deleted: 1 }))
		.where({ user_id: userId, type: "totp", is_verified: 1, is_deleted: 0 })
		.whereNot("id", record.id);

	return ensureBackupCodesExist(userId);
};

/**
 * Verify an enabled TOTP method. Unverified/seeded secrets fail closed.
 * @param {number} userId
 * @param {string} code
 * @returns {Promise<boolean>}
 */
const verifyTotp = async (userId, code) => {
	if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
		return false;
	}

	const record = await UserTwoFa.query().findOne({
		user_id: userId,
		type: "totp",
		is_verified: 1,
		is_deleted: 0,
	});
	if (!record) {
		return false;
	}

	try {
		return verifySync({ token: code, secret: revealSecret(record.secret) }).valid;
	} catch {
		return false;
	}
};

// ---------------------------------------------------------------------------
// YubiKey OTP
// ---------------------------------------------------------------------------

const canonicalizeYubicoFields = (fields) =>
	Object.entries(fields)
		.filter(([key]) => key !== "h")
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}=${value}`)
		.join("&");

const signYubicoFields = (fields, secretKey) =>
	crypto.createHmac("sha1", secretKey).update(canonicalizeYubicoFields(fields), "utf8").digest("base64");

const parseYubicoResponse = (body) => {
	const fields = {};
	for (const line of body.split(/\r?\n/)) {
		if (!line) continue;
		const separator = line.indexOf("=");
		if (separator <= 0) {
			throw new errs.ValidationError("Invalid YubiKey validation response");
		}
		const key = line.slice(0, separator);
		if (Object.hasOwn(fields, key)) {
			throw new errs.ValidationError("Invalid YubiKey validation response");
		}
		fields[key] = line.slice(separator + 1);
	}
	return fields;
};

const timingSafeBase64Equal = (left, right) => {
	if (typeof left !== "string" || !BASE64_PATTERN.test(left)) return false;
	const leftBuffer = Buffer.from(left, "base64");
	const rightBuffer = Buffer.from(right, "base64");
	return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const getYubicoConfiguration = () => {
	const clientId = process.env.YUBICO_CLIENT_ID?.trim();
	const encodedSecret = process.env.YUBICO_SECRET_KEY?.trim();
	if (!clientId || !/^\d{1,10}$/.test(clientId) || clientId === "0") {
		throw new errs.ConfigurationError("YUBICO_CLIENT_ID must be configured for YubiKey OTP validation");
	}
	if (!encodedSecret || !BASE64_PATTERN.test(encodedSecret)) {
		throw new errs.ConfigurationError("YUBICO_SECRET_KEY must be a valid Base64 validation secret");
	}
	const secretKey = Buffer.from(encodedSecret, "base64");
	if (secretKey.length < 16) {
		throw new errs.ConfigurationError("YUBICO_SECRET_KEY is too short");
	}

	let rawApiUrl = process.env.YUBICO_API_URL?.trim() || "https://api.yubico.com/wsapi/2.0/verify";
	if (!rawApiUrl.includes("://")) rawApiUrl = `https://${rawApiUrl}`;
	let apiUrl;
	try {
		apiUrl = new URL(rawApiUrl);
	} catch {
		throw new errs.ConfigurationError("YUBICO_API_URL is invalid");
	}
	if (apiUrl.protocol !== "https:" || apiUrl.username || apiUrl.password || apiUrl.hash) {
		throw new errs.ConfigurationError("YUBICO_API_URL must be an HTTPS URL without credentials or a fragment");
	}
	if (apiUrl.search) {
		throw new errs.ConfigurationError("YUBICO_API_URL must not contain query parameters");
	}
	if (apiUrl.pathname === "/") apiUrl.pathname = "/wsapi/2.0/verify";

	return { clientId, secretKey, apiUrl };
};

/**
 * Validate an OTP with the signed Yubico Validation Protocol 2.0.
 * @param {string} otp
 * @returns {Promise<{ status: string, deviceId: string }>}
 */
const validateYubikeyOtp = async (otp) => {
	if (typeof otp !== "string" || !YUBIKEY_MODHEX_PATTERN.test(otp)) {
		throw new errs.ValidationError("Invalid YubiKey OTP format");
	}

	const { clientId, secretKey, apiUrl } = getYubicoConfiguration();
	const nonce = crypto.randomBytes(20).toString("hex");
	const requestFields = { id: clientId, nonce, otp, sl: "secure", timestamp: "1" };
	const requestSignature = signYubicoFields(requestFields, secretKey);
	const requestUrl = new URL(apiUrl);
	requestUrl.search = new URLSearchParams({ ...requestFields, h: requestSignature }).toString();

	const body = await new Promise((resolve, reject) => {
		const request = https.request(
			requestUrl,
			{
				method: "GET",
				headers: { Accept: "text/plain", "User-Agent": "ShieldPM-YubiKey-Validator/1" },
				timeout: YUBICO_TIMEOUT_MS,
			},
			(response) => {
				if (response.statusCode !== 200) {
					response.resume();
					reject(new errs.ValidationError("YubiKey validation service rejected the request"));
					return;
				}

				let responseBody = "";
				let responseBytes = 0;
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					responseBytes += Buffer.byteLength(chunk);
					if (responseBytes > YUBICO_RESPONSE_MAX_BYTES) {
						request.destroy(new errs.ValidationError("YubiKey validation response is too large"));
						return;
					}
					responseBody += chunk;
				});
				response.on("end", () => resolve(responseBody));
			},
		);
		request.on("timeout", () => request.destroy(new errs.ValidationError("YubiKey validation timed out")));
		request.on("error", (err) => {
			reject(
				err instanceof errs.ValidationError ? err : new errs.InternalError("YubiKey validation service failed"),
			);
		});
		request.end();
	});

	const responseFields = parseYubicoResponse(body);
	const expectedSignature = signYubicoFields(responseFields, secretKey);
	if (!timingSafeBase64Equal(responseFields.h, expectedSignature)) {
		throw new errs.ValidationError("YubiKey validation response signature is invalid");
	}
	if (responseFields.nonce !== nonce || responseFields.otp !== otp) {
		throw new errs.ValidationError("YubiKey validation response does not match the request");
	}
	if (responseFields.status !== "OK") {
		throw new errs.ValidationError("YubiKey OTP was rejected");
	}

	return { status: responseFields.status, deviceId: otp.slice(0, -32) };
};

/** @param {number} userId @param {string} otp @param {string} [label] */
const addYubikey = async (userId, otp, label = "YubiKey") => {
	const { deviceId } = await validateYubikeyOtp(otp);
	const credentialIdHash = hashYubikeyId(deviceId);
	const existing = await UserTwoFa.query().findOne({
		credential_id_hash: credentialIdHash,
	});
	if (existing) {
		throw new errs.ValidationError("This YubiKey is already registered to an account");
	}

	let record;
	try {
		record = await UserTwoFa.query().insertAndFetch(
			/** @type {any} */ ({
				user_id: userId,
				type: "yubikey",
				label: normalizeLabel(label, "YubiKey"),
				secret: deviceId,
				credential_id_hash: credentialIdHash,
				is_verified: 1,
			}),
		);
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new errs.ValidationError("This YubiKey is already registered to an account");
		}
		throw error;
	}
	await ensureBackupCodesExist(userId);
	return record;
};

/** @param {number} userId @param {string} otp @returns {Promise<boolean>} */
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

const normalizeOrigin = (value, label, allowHttpLocalhost = false) => {
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		throw new errs.ConfigurationError(`${label} is not a valid origin`);
	}
	const httpLocalhost = allowHttpLocalhost && parsed.protocol === "http:" && parsed.hostname === "localhost";
	if (parsed.protocol !== "https:" && !httpLocalhost) {
		throw new errs.ConfigurationError(`${label} must use HTTPS`);
	}
	if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
		throw new errs.ConfigurationError(`${label} must contain only scheme, host, and optional port`);
	}
	return parsed.origin;
};

const getRequestOrigin = (req) => {
	const protocol = req?.protocol;
	const host = req?.headers?.host || req?.hostname;
	if (!/^(?:http|https)$/.test(protocol || "") || typeof host !== "string" || /[\s\\/]/.test(host)) {
		throw new errs.ValidationError("Cannot determine the WebAuthn request origin");
	}
	return new URL(`${protocol}://${host}`).origin;
};

const validateRpId = (rpID, origin) => {
	const normalizedRpId = rpID.toLowerCase().replace(/\.$/, "");
	if (!/^(?:localhost|[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/.test(normalizedRpId)) {
		throw new errs.ConfigurationError("PASSKEY_RP_ID is invalid");
	}
	const originHost = new URL(origin).hostname.toLowerCase();
	if (originHost !== normalizedRpId && !originHost.endsWith(`.${normalizedRpId}`)) {
		throw new errs.ConfigurationError("PASSKEY_RP_ID must equal the origin host or a registrable parent domain");
	}
	return normalizedRpId;
};

/**
 * Resolve a canonical WebAuthn context. Production deliberately requires an
 * explicit origin so an attacker-controlled Host/Origin header cannot define
 * the relying party.
 * @param {any} req
 * @returns {{ rpID: string, origin: string, rpName: string }}
 */
const getPasskeyContext = (req) => {
	const isProduction = process.env.NODE_ENV === "production";
	const allowHttpLocalhost = !isProduction;
	const configuredOrigin = process.env.PASSKEY_ORIGIN?.trim();
	if (isProduction && !configuredOrigin) {
		throw new errs.ConfigurationError("PASSKEY_ORIGIN must be configured in production");
	}

	const origin = configuredOrigin
		? normalizeOrigin(configuredOrigin, "PASSKEY_ORIGIN", allowHttpLocalhost)
		: normalizeOrigin(getRequestOrigin(req), "WebAuthn request origin", allowHttpLocalhost);
	const suppliedOrigin = req?.headers?.origin;
	if (typeof suppliedOrigin === "string") {
		let normalizedSuppliedOrigin;
		try {
			normalizedSuppliedOrigin = normalizeOrigin(suppliedOrigin, "Origin header", allowHttpLocalhost);
		} catch {
			throw new errs.ValidationError("WebAuthn request origin is invalid");
		}
		if (normalizedSuppliedOrigin !== origin) {
			throw new errs.ValidationError("WebAuthn request origin does not match PASSKEY_ORIGIN");
		}
	}

	const rpID = validateRpId(process.env.PASSKEY_RP_ID?.trim() || new URL(origin).hostname, origin);
	const rpName = process.env.PASSKEY_RP_NAME?.trim().slice(0, 64) || APP_NAME;
	return { rpID, origin, rpName };
};

const hashCredentialId = (credentialId) => crypto.createHash("sha256").update(credentialId, "utf8").digest("hex");
const hashYubikeyId = (deviceId) => hashCredentialId(`yubikey\0${deviceId}`);

/** @param {number} userId @param {string} userEmail @param {any} req */
const beginPasskeyRegistration = async (userId, userEmail, req) => {
	const { rpID, origin, rpName } = getPasskeyContext(req);
	const existingPasskeys = await UserTwoFa.query().where({ user_id: userId, type: "passkey", is_deleted: 0 });
	const excludeCredentials = existingPasskeys.map((passkey) => ({
		id: passkey.secret,
		transports: passkey.transports ? passkey.transports.split(",") : [],
	}));
	const user = await userModel.query().findById(userId);
	if (!user) {
		throw new errs.ItemNotFoundError(`User ${userId}`);
	}

	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userID: Buffer.from(String(userId), "utf8"),
		userName: userEmail,
		userDisplayName: user.name || userEmail,
		attestationType: "none",
		excludeCredentials: /** @type {any} */ (excludeCredentials),
		authenticatorSelection: {
			residentKey: "preferred",
			userVerification: "required",
		},
	});
	const challengeId = await createBoundChallenge({
		userId,
		type: "passkey_registration",
		purpose: PURPOSE_ENROLLMENT,
		req,
		challenge: options.challenge,
		rpID,
		origin,
	});
	return { options, challengeId };
};

/** @param {number} userId @param {string} challengeId @param {any} registrationResponse @param {any} req */
const completePasskeyRegistration = async (userId, challengeId, registrationResponse, req, label = "Passkey") => {
	const currentContext = getPasskeyContext(req);
	const challengeRecord = await consumeBoundChallenge({
		userId,
		challengeId,
		type: "passkey_registration",
		purpose: PURPOSE_ENROLLMENT,
		req,
	});
	if (challengeRecord.rp_id !== currentContext.rpID || challengeRecord.origin !== currentContext.origin) {
		throw new errs.ValidationError("Passkey registration context changed");
	}

	let verification;
	try {
		verification = await verifyRegistrationResponse({
			response: registrationResponse,
			expectedChallenge: challengeRecord.challenge,
			expectedOrigin: challengeRecord.origin,
			expectedRPID: challengeRecord.rp_id,
			requireUserVerification: true,
		});
	} catch {
		throw new errs.ValidationError("Passkey registration verification failed");
	}
	if (!verification.verified || !verification.registrationInfo?.credential) {
		throw new errs.ValidationError("Passkey registration verification failed");
	}

	const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
	if (typeof credential.id !== "string" || credential.id.length === 0 || credential.id.length > 2048) {
		throw new errs.ValidationError("Passkey credential ID is invalid");
	}
	const initialCounter = Number(credential.counter);
	const publicKey = Buffer.from(credential.publicKey || []);
	if (
		!Number.isSafeInteger(initialCounter) ||
		initialCounter < 0 ||
		publicKey.length === 0 ||
		publicKey.length > 16_384
	) {
		throw new errs.ValidationError("Passkey credential data is invalid");
	}
	const credentialIdHash = hashCredentialId(credential.id);
	const existingCredential = await UserTwoFa.query().findOne({
		type: "passkey",
		credential_id_hash: credentialIdHash,
	});
	if (
		existingCredential &&
		(Number(existingCredential.user_id) !== Number(userId) || !existingCredential.is_deleted)
	) {
		throw new errs.ValidationError("This passkey is already registered");
	}

	const transports = Array.isArray(registrationResponse?.response?.transports)
		? registrationResponse.response.transports
				.filter((transport) => typeof transport === "string" && /^[a-z-]{2,32}$/.test(transport))
				.slice(0, 8)
				.join(",") || null
		: null;
	const credentialData = /** @type {any} */ ({
		user_id: userId,
		type: "passkey",
		label: normalizeLabel(label, "Passkey"),
		secret: credential.id,
		credential_id_hash: credentialIdHash,
		public_key: publicKey.toString("base64"),
		counter: initialCounter,
		transports,
		meta: { credentialDeviceType, credentialBackedUp: !!credentialBackedUp },
		is_verified: 1,
		is_deleted: 0,
	});
	try {
		if (existingCredential) {
			const restored = await UserTwoFa.query()
				.patch(credentialData)
				.where({ id: existingCredential.id, user_id: userId, is_deleted: 1 });
			if (restored !== 1) {
				throw new errs.ValidationError("This passkey could not be restored safely");
			}
		} else {
			await UserTwoFa.query().insert(credentialData);
		}
	} catch (err) {
		if (isUniqueViolation(err)) {
			throw new errs.ValidationError("This passkey is already registered");
		}
		throw err;
	}

	return { backupCodes: await ensureBackupCodesExist(userId) };
};

/** @param {number} userId @param {any} req @param {any} [context] */
const beginPasskeyAuthentication = async (userId, req, context = null) => {
	const { rpID, origin } = getPasskeyContext(req);
	const bindingContext = context || req;
	const purpose = getAuthenticationPurpose(bindingContext);
	const passkeys = await UserTwoFa.query().where({
		user_id: userId,
		type: "passkey",
		is_verified: 1,
		is_deleted: 0,
	});
	if (passkeys.length === 0) {
		throw new errs.ValidationError("No passkeys registered for this user");
	}

	const allowCredentials = passkeys.map((passkey) => ({
		id: passkey.secret,
		transports: passkey.transports ? passkey.transports.split(",") : [],
	}));
	const options = await generateAuthenticationOptions({
		rpID,
		allowCredentials: /** @type {any} */ (allowCredentials),
		userVerification: "required",
	});
	const challengeId = await createBoundChallenge({
		userId,
		type: "passkey_authentication",
		purpose,
		req: bindingContext,
		challenge: options.challenge,
		rpID,
		origin,
		singleUseFlow: true,
	});
	return { options, challengeId };
};

/** @param {number} userId @param {string} challengeId @param {any} authResponse @param {any} req @param {any} [context] */
const completePasskeyAuthentication = async (userId, challengeId, authResponse, req, context = null) => {
	const currentContext = getPasskeyContext(req);
	const bindingContext = context || req;
	const purpose = getAuthenticationPurpose(bindingContext);
	const challengeRecord = await consumeBoundChallenge({
		userId,
		challengeId,
		type: "passkey_authentication",
		purpose,
		req: bindingContext,
	});
	if (challengeRecord.rp_id !== currentContext.rpID || challengeRecord.origin !== currentContext.origin) {
		throw new errs.ValidationError("Passkey authentication context changed");
	}

	const credentialId = authResponse?.id;
	if (typeof credentialId !== "string" || credentialId.length === 0 || credentialId.length > 2048) {
		throw new errs.ValidationError("Passkey credential is invalid");
	}
	const passkey = await UserTwoFa.query().findOne({
		user_id: userId,
		type: "passkey",
		credential_id_hash: hashCredentialId(credentialId),
		is_verified: 1,
		is_deleted: 0,
	});
	if (!passkey || passkey.secret !== credentialId || !passkey.public_key) {
		throw new errs.ValidationError("Passkey not found");
	}
	const oldCounter = Number(passkey.counter);
	if (!Number.isSafeInteger(oldCounter) || oldCounter < 0) {
		throw new errs.ValidationError("Stored passkey counter is invalid");
	}

	let verification;
	try {
		verification = await verifyAuthenticationResponse({
			response: authResponse,
			expectedChallenge: challengeRecord.challenge,
			expectedOrigin: challengeRecord.origin,
			expectedRPID: challengeRecord.rp_id,
			requireUserVerification: true,
			credential: {
				id: passkey.secret,
				publicKey: new Uint8Array(Buffer.from(passkey.public_key, "base64")),
				counter: oldCounter,
				transports: /** @type {any} */ (passkey.transports ? passkey.transports.split(",") : []),
			},
		});
	} catch {
		throw new errs.ValidationError("Passkey authentication failed");
	}
	if (!verification.verified) {
		throw new errs.ValidationError("Passkey authentication failed");
	}

	const newCounter = Number(verification.authenticationInfo?.newCounter);
	if (!Number.isSafeInteger(newCounter) || newCounter < 0 || (oldCounter > 0 && newCounter <= oldCounter)) {
		throw new errs.ValidationError("Passkey signature counter rollback detected");
	}
	if (newCounter > oldCounter) {
		const updated = await UserTwoFa.query()
			.patch({ counter: newCounter })
			.where({ id: passkey.id, user_id: userId, counter: oldCounter, is_deleted: 0 });
		if (updated !== 1) {
			throw new errs.ValidationError("Passkey signature counter race detected");
		}
	}

	return true;
};

// ---------------------------------------------------------------------------
// Duo Security (Universal Prompt)
// ---------------------------------------------------------------------------

const validateDuoConfiguration = (config) => {
	const clientId = config?.clientId?.trim();
	const clientSecret = config?.clientSecret?.trim();
	const apiHost = config?.apiHost?.trim().toLowerCase();
	const redirectUrl = config?.redirectUrl?.trim();
	if (!clientId || clientId.length !== duoConstants.CLIENT_ID_LENGTH || !/^DI[A-Z0-9]+$/.test(clientId)) {
		throw new errs.ValidationError("Duo clientId is invalid");
	}
	if (!clientSecret || clientSecret.length !== duoConstants.CLIENT_SECRET_LENGTH) {
		throw new errs.ValidationError("Duo clientSecret is invalid");
	}
	if (!apiHost || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.duosecurity\.com$/.test(apiHost)) {
		throw new errs.ValidationError("Duo apiHost must be a duosecurity.com hostname");
	}

	let parsedRedirect;
	try {
		parsedRedirect = new URL(redirectUrl);
	} catch {
		throw new errs.ValidationError("Duo redirectUrl is invalid");
	}
	if (
		parsedRedirect.protocol !== "https:" ||
		parsedRedirect.username ||
		parsedRedirect.password ||
		parsedRedirect.search ||
		parsedRedirect.hash
	) {
		throw new errs.ValidationError("Duo redirectUrl must be an HTTPS URL without credentials, query, or fragment");
	}

	return { clientId, clientSecret, apiHost, redirectUrl: parsedRedirect.href };
};

const createDuoClient = (storedConfig) => {
	try {
		const normalized = validateDuoConfiguration({
			clientId: storedConfig?.clientId,
			clientSecret: revealSecret(storedConfig?.clientSecret),
			apiHost: storedConfig?.apiHost,
			redirectUrl: storedConfig?.redirectUrl,
		});
		return new DuoClient(normalized);
	} catch {
		throw new errs.ConfigurationError("Stored Duo configuration is invalid");
	}
};

/** @param {number} userId @param {object} config */
const setupDuo = async (userId, config) => {
	const normalized = validateDuoConfiguration(config);
	let client;
	try {
		client = new DuoClient(normalized);
	} catch {
		throw new errs.ValidationError("Duo configuration is invalid");
	}
	try {
		await client.healthCheck();
	} catch {
		throw new errs.ValidationError("Duo configuration health check failed");
	}

	await UserTwoFa.query()
		.patch(/** @type {any} */ ({ is_deleted: 1 }))
		.where({ user_id: userId, type: "duo", is_deleted: 0 });
	const record = await UserTwoFa.query().insertAndFetch(
		/** @type {any} */ ({
			user_id: userId,
			type: "duo",
			label: "Duo Security",
			meta: { ...normalized, clientSecret: protectSecret(normalized.clientSecret) },
			is_verified: 1,
		}),
	);
	await ensureBackupCodesExist(userId);
	return record;
};

/** @param {number} userId @param {string} userEmail @param {any} context */
const beginDuoAuthentication = async (userId, userEmail, context) => {
	const duoRecord = await UserTwoFa.query().findOne({
		user_id: userId,
		type: "duo",
		is_verified: 1,
		is_deleted: 0,
	});
	if (!duoRecord) {
		throw new errs.ValidationError("Duo Security is not configured for this user");
	}

	const client = createDuoClient(duoRecord.meta);
	const purpose = getAuthenticationPurpose(context);
	const state = await createBoundChallenge({
		userId,
		type: "duo_authentication",
		purpose,
		req: context,
		challenge: "duo_state",
		singleUseFlow: true,
	});
	let authUrl;
	try {
		authUrl = await client.createAuthUrl(userEmail, state);
	} catch {
		throw new errs.ValidationError("Failed to start Duo authentication");
	}
	return { authUrl, state };
};

/**
 * Complete a bound Duo authorization. The callback state is mandatory and is
 * consumed before the provider code is exchanged.
 * @param {number} userId
 * @param {string} userEmail
 * @param {string} duoCode
 * @param {string} state
 * @param {any} context
 * @returns {Promise<boolean>}
 */
const completeDuoAuthentication = async (userId, userEmail, duoCode, state, context) => {
	const duoRecord = await UserTwoFa.query().findOne({
		user_id: userId,
		type: "duo",
		is_verified: 1,
		is_deleted: 0,
	});
	if (!duoRecord) {
		throw new errs.ValidationError("Duo Security is not configured for this user");
	}
	await consumeBoundChallenge({
		userId,
		challengeId: state,
		type: "duo_authentication",
		purpose: getAuthenticationPurpose(context),
		req: context,
	});

	let tokenResult;
	try {
		tokenResult = await createDuoClient(duoRecord.meta).exchangeAuthorizationCodeFor2FAResult(duoCode, userEmail);
	} catch {
		throw new errs.ValidationError("Duo authentication failed");
	}

	const resultUsername = tokenResult?.preferred_username;
	const authTime = Number(tokenResult?.auth_time);
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (
		typeof resultUsername !== "string" ||
		resultUsername.toLowerCase() !== userEmail.toLowerCase() ||
		!Number.isFinite(authTime) ||
		authTime > nowSeconds + 60 ||
		authTime < nowSeconds - Math.ceil(MFA_CHALLENGE_TTL_MS / 1000) - 60
	) {
		throw new errs.ValidationError("Duo authentication result is invalid or stale");
	}
	return true;
};

// ---------------------------------------------------------------------------
// Backup codes and method management
// ---------------------------------------------------------------------------

/** @param {number} userId @returns {Promise<string[]|null>} */
const ensureBackupCodesExist = async (userId) => generateAndStoreBackupCodes(userId, true);

/** @param {number} userId @param {string} code @returns {Promise<boolean>} */
const verifyBackupCode = async (userId, code) => {
	if (typeof code !== "string") return false;
	const normalizedCode = code.toUpperCase().replace(/[\s-]/g, "");
	if (!/^[A-Z0-9]{10}$/.test(normalizedCode)) return false;
	return !!(await UserTwoFaBackupCode.findAndConsume(userId, normalizedCode));
};

/** @param {number} userId @returns {Promise<number>} */
const getRemainingBackupCodeCount = (userId) =>
	UserTwoFaBackupCode.query().where({ user_id: userId }).whereNull("used_at").resultSize();

/** @param {number} userId @param {number} methodId */
const removeTwoFaMethod = async (userId, methodId) => {
	const record = await UserTwoFa.query().findOne({ id: methodId, user_id: userId, is_deleted: 0 });
	if (!record || !REAL_METHOD_TYPES.includes(record.type)) {
		throw new errs.ItemNotFoundError(`2FA method ${methodId}`);
	}
	const removed = await UserTwoFa.query()
		.patch(/** @type {any} */ ({ is_deleted: 1 }))
		.where({ id: methodId, user_id: userId, is_deleted: 0 });
	if (removed !== 1) {
		throw new errs.ItemNotFoundError(`2FA method ${methodId}`);
	}

	const activeCount = await UserTwoFa.query()
		.where({ user_id: userId, is_verified: 1, is_deleted: 0 })
		.whereIn("type", REAL_METHOD_TYPES)
		.resultSize();
	if (activeCount === 0) {
		await UserTwoFaBackupCode.query().delete().where({ user_id: userId });
	}
};

// ---------------------------------------------------------------------------
// Unified login-time verification
// ---------------------------------------------------------------------------

/**
 * Verify a direct MFA code once per pending login token.
 * @param {number} userId
 * @param {string} method
 * @param {string} code
 * @param {any} context
 * @returns {Promise<boolean>}
 */
const verifyLoginChallenge = async (userId, method, code, context) => {
	if (!["totp", "yubikey", "backup_code"].includes(method)) {
		throw new errs.ValidationError(`Unknown 2FA method: ${method}`);
	}
	// The caller owns and atomically consumes the parent login/step-up
	// challenge. Direct OTP methods have no separate browser challenge; Passkey
	// and Duo use the bound records above.
	getAuthenticationPurpose(context);

	switch (method) {
		case "totp":
			return verifyTotp(userId, code);
		case "yubikey":
			return verifyYubikey(userId, code);
		case "backup_code":
			return verifyBackupCode(userId, code);
		default:
			return false;
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
	verifyBackupCode,
	getRemainingBackupCodeCount,
	removeTwoFaMethod,
	verifyLoginChallenge,
};
