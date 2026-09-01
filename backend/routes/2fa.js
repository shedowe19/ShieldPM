/**
 * 2FA Management Routes
 *
 * All routes under /api/users/:id/2fa — managing 2FA methods
 * for the currently-authenticated user or an admin.
 */

import express from "express";
import rateLimit from "express-rate-limit";
import twoFaService from "../internal/2fa-service.js";
import internalToken from "../internal/token.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import userIdFromMe from "../lib/express/user-id-from-me.js";
import UserTwoFa from "../models/user-2fa.js";
import UserTwoFaBackupCode from "../models/user-2fa-backup-codes.js";

const twoFaRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: { code: 429, message: "Too many requests, please try again later." } },
});

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// All 2FA routes require authentication
router.use(jwtdecode());

// Resolve :user_id ("me" → numeric id)
router.use(userIdFromMe);

/**
 * Helper: assert the requesting user is the target user or an admin.
 */
const requireSelfOrAdmin = (req, res) => {
	const access = res.locals.access;
	const requesterId = Number(access?.token?.getUserId?.());

	if (!requesterId || !Number.isFinite(requesterId)) {
		throw new errs.UnauthorizedError("Authentication required");
	}

	// userIdFromMe middleware resolves "me" to the token user ID as a Number.
	// As a safety net, if "me" was not resolved (access unavailable during middleware),
	// treat it as the requester's own ID — "me" unambiguously means the current user.
	const rawParam = req.params.user_id;
	const targetUserId = rawParam === "me" ? requesterId : Number(rawParam);

	const isAdmin = access?.token?.hasScope?.("admin") === true;
	if (!isAdmin && requesterId !== targetUserId) {
		throw new errs.PermissionError("You can only manage your own 2FA settings");
	}

	return targetUserId;
};

/**
 * MFA credentials are identity-bound. Even administrators may inspect a
 * user's configured methods, but they must not enroll, replace, or remove a
 * credential for another account.
 */
const requireSelf = (req, res) => {
	const targetUserId = requireSelfOrAdmin(req, res);
	const requesterId = Number(res.locals.access?.token?.getUserId?.());
	if (requesterId !== targetUserId) {
		throw new errs.PermissionError("MFA credentials can only be changed by their owner");
	}
	return targetUserId;
};

const requireRecentSelf = async (req, res) => {
	const targetUserId = requireSelf(req, res);
	await internalToken.requireRecentAuthentication(res.locals.access);
	return targetUserId;
};

const getStableMfaRequest = (req, res) => {
	const session = res.locals.access?.session;
	const userId = Number(res.locals.access?.token?.getUserId?.(0) || 0);
	if (!session?.family_id || !userId) {
		throw new errs.AuthError("An active session is required for MFA management");
	}
	return {
		body: req.body,
		cookies: req.cookies,
		headers: req.headers,
		hostname: req.hostname,
		protocol: req.protocol,
		// The family survives normal refresh rotation but changes on a new
		// login. Enrollment can therefore finish while the access token rotates.
		sessionBinding: `auth-family:${session.family_id}:user:${userId}`,
	};
};

// ---------------------------------------------------------------------------
// GET /api/users/:id/2fa
// List active 2FA methods for a user
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
	const userId = requireSelfOrAdmin(req, res);

	const methods = await UserTwoFa.query()
		.where({ user_id: userId, is_deleted: 0 })
		.whereIn("type", ["totp", "yubikey", "passkey", "duo"])
		.select("id", "type", "label", "is_verified", "created_on", "modified_on");

	const backupCount = await UserTwoFaBackupCode.query().where({ user_id: userId }).whereNull("used_at").resultSize();

	res.status(200).json({ methods, backup_codes_remaining: backupCount });
});

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

/**
 * POST /api/users/:id/2fa/totp/setup
 * Begin TOTP setup — returns a QR code data URL.
 */
router.post("/totp/setup", twoFaRateLimiter, async (req, res) => {
	const userId = await requireRecentSelf(req, res);
	const { default: userModel } = await import("../models/user.js");
	const user = await userModel.query().findById(userId);
	const email = user?.email;

	if (!email) {
		throw new errs.ValidationError("Cannot determine user email for TOTP setup");
	}

	const result = await twoFaService.setupTotp(userId, email, getStableMfaRequest(req, res));

	// Do not expose the raw secret in production; return only the QR
	res.status(200).json({
		qr_data_url: result.qrDataUrl,
		otpauth_url: result.otpauthUrl,
	});
});

/**
 * POST /api/users/:id/2fa/totp/enable
 * Verify a TOTP code and activate the method.
 */
router.post("/totp/enable", twoFaRateLimiter, async (req, res) => {
	const userId = await requireRecentSelf(req, res);
	const { code } = req.body;

	if (!code || typeof code !== "string") {
		throw new errs.ValidationError("TOTP code is required");
	}

	const backupCodes = await twoFaService.verifyAndEnableTotp(userId, code, getStableMfaRequest(req, res));
	res.status(200).json({ message: "TOTP enabled successfully", backup_codes: backupCodes });
});

// ---------------------------------------------------------------------------
// YubiKey
// ---------------------------------------------------------------------------

/**
 * POST /api/users/:id/2fa/yubikey/add
 * Register a YubiKey by validating a fresh OTP.
 */
router.post("/yubikey/add", twoFaRateLimiter, async (req, res) => {
	const userId = await requireRecentSelf(req, res);
	const { otp, label } = req.body;

	if (!otp || typeof otp !== "string") {
		throw new errs.ValidationError("YubiKey OTP is required");
	}

	const record = await twoFaService.addYubikey(userId, otp, label);
	res.status(201).json({
		id: record.id,
		type: record.type,
		label: record.label,
		created_on: record.created_on,
	});
});

// ---------------------------------------------------------------------------
// Passkey / WebAuthn
// ---------------------------------------------------------------------------

/**
 * POST /api/users/:id/2fa/passkey/register/begin
 * Generate WebAuthn registration options.
 */
router.post("/passkey/register/begin", twoFaRateLimiter, async (req, res) => {
	const userId = await requireRecentSelf(req, res);
	const { default: userModel } = await import("../models/user.js");
	const user = await userModel.query().findById(userId);

	if (!user) {
		throw new errs.ItemNotFoundError(`User ${userId}`);
	}

	const { options, challengeId } = await twoFaService.beginPasskeyRegistration(
		userId,
		user.email,
		getStableMfaRequest(req, res),
	);
	res.status(200).json({ options, challenge_id: challengeId });
});

/**
 * POST /api/users/:id/2fa/passkey/register/complete
 * Verify WebAuthn registration and store the credential.
 */
router.post("/passkey/register/complete", twoFaRateLimiter, async (req, res) => {
	const userId = await requireRecentSelf(req, res);
	const { challenge_id, registration_response, label } = req.body;

	if (!challenge_id || !registration_response) {
		throw new errs.ValidationError("challenge_id and registration_response are required");
	}

	const result = await twoFaService.completePasskeyRegistration(
		userId,
		challenge_id,
		registration_response,
		getStableMfaRequest(req, res),
		label,
	);
	res.status(201).json({ message: "Passkey registered successfully", backup_codes: result.backupCodes });
});

// ---------------------------------------------------------------------------
// Duo Security
// ---------------------------------------------------------------------------

/**
 * POST /api/users/:id/2fa/duo/setup
 * Configure Duo Security integration.
 */
router.post("/duo/setup", twoFaRateLimiter, async (req, res) => {
	const userId = await requireRecentSelf(req, res);
	const { client_id, client_secret, api_host, redirect_url } = req.body;

	const record = await twoFaService.setupDuo(userId, {
		clientId: client_id,
		clientSecret: client_secret,
		apiHost: api_host,
		redirectUrl: redirect_url,
	});

	res.status(201).json({
		id: record.id,
		type: record.type,
		label: record.label,
		created_on: record.created_on,
	});
});

// ---------------------------------------------------------------------------
// Remove a 2FA method
// ---------------------------------------------------------------------------

/**
 * DELETE /api/users/:id/2fa/:methodId
 * Remove a specific 2FA method.
 */
router.delete("/:methodId", twoFaRateLimiter, async (req, res) => {
	const userId = await requireRecentSelf(req, res);
	const methodId = Number.parseInt(req.params.methodId, 10);

	if (!methodId || Number.isNaN(methodId)) {
		throw new errs.ValidationError("Invalid method ID");
	}

	await twoFaService.removeTwoFaMethod(userId, methodId);
	res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Backup Codes
// ---------------------------------------------------------------------------

/**
 * GET /api/users/:id/2fa/backup-codes/count
 * Return the number of unused backup codes.
 */
router.get("/backup-codes/count", async (req, res) => {
	const userId = requireSelfOrAdmin(req, res);
	const count = await twoFaService.getRemainingBackupCodeCount(userId);
	res.status(200).json({ remaining: count });
});

/**
 * POST /api/users/:id/2fa/backup-codes/regenerate
 * Regenerate all backup codes (invalidates existing ones).
 */
router.post("/backup-codes/regenerate", twoFaRateLimiter, async (req, res) => {
	const userId = await requireRecentSelf(req, res);
	const codes = await twoFaService.regenerateBackupCodes(userId);
	res.status(200).json({ backup_codes: codes });
});

export default router;
