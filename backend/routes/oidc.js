import express from "express";
import rateLimit from "express-rate-limit";
import * as client from "openid-client";
import internalAuditLog from "../internal/audit-log.js";
import internalToken from "../internal/token.js";
import { clearAuthCookies, clearDuoCookie, setAuthCookies } from "../lib/auth-cookies.js";
import { decrypt, encrypt, isEncrypted } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { AUDIT_ACTION } from "../lib/security-events.js";
import { oidc as logger } from "../logger.js";
import settingModel from "../models/setting.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import UserTwoFa from "../models/user-2fa.js";

const OIDC_COOKIE = "shieldpm_oidc";
const OIDC_STEPUP_COOKIE = "shieldpm_oidc_stepup";
const LOGIN_STATE_PURPOSE = "shieldpm:oidc-login:v1";
const STEPUP_STATE_PURPOSE = "shieldpm:oidc-stepup:v1";
const LOGIN_STATE_TTL_MS = 5 * 60 * 1000;
const STEPUP_STATE_TTL_MS = 5 * 60 * 1000;

// Set up rate limiter: for example, 100 requests per 15 minutes per IP
const oidcRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	message: { error: "Too many authorization requests from this IP, please try again later." },
});

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * @param {import("express").Request} req
 * @param {string} action
 * @param {string} outcome
 * @param {Record<string, any>} [meta]
 */
const auditOidc = (req, action, outcome, meta = {}) =>
	Promise.resolve(
		internalAuditLog.add(null, {
			action,
			object_type: "auth",
			outcome,
			ip: req.ip,
			meta,
		}),
	).catch((error) => logger.error(`Could not audit OIDC event: ${error?.message}`));

const oidcFailureReason = (error) =>
	error instanceof errs.ConfigurationError
		? "configuration"
		: error instanceof errs.AuthError || error instanceof errs.PermissionError
			? error.public
				? error.message
				: "authentication_failed"
			: "provider_error";

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(oidcRateLimiter)

	/**
	 * GET /api/oidc
	 *
	 * OAuth Authorization Code flow initialisation
	 */
	.get(async (req, res) => {
		try {
			const settings = await settingModel.query().where({ id: "oidc-config" }).first();
			const params = await getInitParams(settings);
			await auditOidc(req, AUDIT_ACTION.OIDC_LOGIN_STARTED, "started");
			redirectToAuthorizationURL(req, res, params);
		} catch (err) {
			await auditOidc(req, AUDIT_ACTION.OIDC_LOGIN_FAILED, "failure", {
				stage: "start",
				reason: oidcFailureReason(err),
			});
			redirectWithError(res, err);
		}
	});

router
	.route("/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /api/oidc/callback
	 *
	 * Oauth Authorization Code flow callback
	 */
	.get(async (req, res) => {
		try {
			const settings = await settingModel.query().where({ id: "oidc-config" }).first();
			const result = await validateCallback(req, settings);
			await auditOidc(req, AUDIT_ACTION.OIDC_LOGIN_SUCCEEDED, "success", {
				stage: "callback",
				email: typeof result?.email === "string" ? result.email : null,
				step_up: Boolean(result?.stepUp),
			});
			if (result?.stepUp) {
				redirectToStepUp(req, res, result.stepUp);
				return;
			}
			redirectWithJwtToken(req, res, result);
		} catch (err) {
			await auditOidc(req, AUDIT_ACTION.OIDC_LOGIN_FAILED, "failure", {
				stage: "callback",
				reason: oidcFailureReason(err),
			});
			redirectWithError(res, err);
		}
	});

router
	.route("/claim")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(oidcRateLimiter)
	.post(async (req, res) => {
		try {
			assertEnabled(await settingModel.query().where({ id: "oidc-config" }).first());
			const token = readTokenHandoff(req);
			const payload = await TokenModel().load(token);
			if (!payload.scope?.includes("user") || !Number.isSafeInteger(payload.attrs?.id)) {
				throw new errs.AuthError("Invalid OIDC token");
			}
			const user = await userModel.query().findById(payload.attrs.id).where({ is_deleted: 0, is_disabled: 0 });
			if (!user) {
				throw new errs.AuthError("User cannot be loaded for OIDC token");
			}
			await assertOidcAccountLinkAllowed(user, user.email);
			// Defense in depth for handoffs issued before the callback-side check:
			// never turn an OIDC handoff into a full session for a 2FA account.
			if (await UserTwoFa.hasActive2FA(user.id)) {
				throw new errs.PermissionError(
					"This account has local two-factor authentication. Sign in with your password and 2FA factor.",
				);
			}
			const pair = await internalToken.issueTokenPair(user, "user", {
				ip: req.ip,
				userAgent: req.headers["user-agent"],
			});
			setAuthCookies(res, req, {
				accessToken: pair.access_token,
				accessExpires: pair.access_expires,
				refreshToken: pair.refresh_token,
				refreshExpires: pair.refresh_expires,
			});
			await auditOidc(req, AUDIT_ACTION.OIDC_LOGIN_SUCCEEDED, "success", {
				stage: "claim",
				user_id: user.id,
				email: user.email,
			});
			res.clearCookie(OIDC_COOKIE);
			res.status(200).send({ expires: pair.access_expires, user: pair.user, csrfToken: res.locals.csrfToken });
		} catch (err) {
			await auditOidc(req, AUDIT_ACTION.OIDC_LOGIN_FAILED, "failure", {
				stage: "claim",
				reason: oidcFailureReason(err),
			});
			res.status(err.status || 400).send({
				error: { message: err.public ? err.message : "OIDC authentication failed" },
			});
		}
	});

router
	.route("/step-up")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(oidcRateLimiter)
	.get(async (req, res) => {
		try {
			const state = readStepUpState(req);
			const pending = await TokenModel().load(state.token);
			if (
				!Array.isArray(pending.scope) ||
				!pending.scope.includes("2fa_pending") ||
				!Number.isSafeInteger(pending.attrs?.id)
			) {
				throw new errs.AuthError("Invalid pending 2FA token");
			}
			const user = await userModel.query().findById(pending.attrs.id).where({ is_deleted: 0, is_disabled: 0 });
			if (!user) {
				throw new errs.AuthError("User cannot be loaded for OIDC step-up");
			}
			const activeMethods = await UserTwoFa.getActiveForUser(user.id);
			// Keep the short-lived step-up cookie so a reload or a StrictMode
			// double effect can resume the same challenge. It expires with the
			// pending token and is cleared on any failure below.
			res.clearCookie(OIDC_COOKIE);
			res.status(200).send({
				requires_2fa: true,
				pending_token: state.token,
				methods: [...new Set(activeMethods.map((method) => method.type))],
				csrfToken: res.locals.csrfToken,
			});
		} catch (err) {
			logger.error(`OIDC step-up failed: ${err.message}`);
			res.clearCookie(OIDC_STEPUP_COOKIE);
			res.status(err.status || 400).send({
				error: { message: err.public ? err.message : "OIDC step-up failed" },
			});
		}
	});

/**
 * Executes discovery and returns the configured `openid-client` client
 *
 * @param {Setting} settings
 * */
const assertEnabled = (settings) => {
	if (settings?.meta?.enabled !== true) {
		throw new errs.AuthError("OIDC authentication is disabled");
	}
};

const assertConfigured = (settings) => {
	assertEnabled(settings);
	for (const key of ["issuerURL", "clientID", "clientSecret"]) {
		if (typeof settings.meta[key] !== "string" || !settings.meta[key].trim()) {
			throw new errs.ConfigurationError(`OIDC ${key} is not configured`);
		}
	}
};

/**
 * Returns the administrator-configured callback URL. Both the authorization
 * request and the token exchange must use this value, never a Host header.
 *
 * @param {Setting} settings
 * @return {URL}
 * */
const getRedirectUri = (settings) => {
	const raw = settings?.meta?.redirectURL;
	if (typeof raw !== "string" || !raw.trim()) {
		throw new errs.ConfigurationError("OIDC redirect URL is not configured");
	}

	let redirectUri;
	try {
		redirectUri = new URL(raw);
	} catch {
		throw new errs.ConfigurationError("OIDC redirect URL is invalid");
	}
	if (!["https:", "http:"].includes(redirectUri.protocol) || redirectUri.hash) {
		throw new errs.ConfigurationError("OIDC redirect URL must be an absolute HTTP(S) URL without a fragment");
	}
	return redirectUri;
};

const getConfig = async (settings) => {
	assertConfigured(settings);
	// Rows written before encryption at rest may still hold a plaintext secret;
	// both forms stay readable until the rotation command re-encrypts them.
	const clientSecret = isEncrypted(settings.meta.clientSecret)
		? decrypt(settings.meta.clientSecret)
		: settings.meta.clientSecret;
	return await client.discovery(new URL(settings.meta.issuerURL), settings.meta.clientID, clientSecret);
};

/**
 * Generates nonce, state, PKCE verifier and the authorization URL.
 *
 * @param {Setting} settings
 * @return {Promise<{url: URL, nonce: string, state: string, codeVerifier: string}>}
 * */
const getInitParams = async (settings) => {
	// Validate the configured callback URL before making any discovery request.
	const redirectUri = getRedirectUri(settings);
	const config = await getConfig(settings);

	const nonce = client.randomNonce();
	const state = client.randomState();
	const codeVerifier = client.randomPKCECodeVerifier();
	const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

	const parameters = {
		redirect_uri: redirectUri.href,
		scope: "openid email",
		nonce,
		state,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	};

	const url = await client.buildAuthorizationUrl(config, parameters);

	return { url, nonce, state, codeVerifier };
};

/**
 * Reads the authenticated login-state cookie. Encryption provides integrity, so
 * an attacker cannot splice nonce/state/verifier from another login ceremony.
 *
 * @param {Request} req
 * @return {{nonce: string, state: string, codeVerifier: string}}
 * */
const readLoginState = (req) => {
	const raw = req.cookies?.[OIDC_COOKIE];
	if (typeof raw !== "string" || !raw) {
		throw new errs.AuthError("Missing OIDC login state. Please restart login.");
	}

	let payload;
	try {
		payload = JSON.parse(decrypt(raw));
	} catch {
		throw new errs.AuthError("Invalid OIDC login state. Please restart login.");
	}

	if (
		payload?.purpose !== LOGIN_STATE_PURPOSE ||
		typeof payload.nonce !== "string" ||
		!payload.nonce ||
		typeof payload.state !== "string" ||
		!payload.state ||
		typeof payload.codeVerifier !== "string" ||
		!payload.codeVerifier ||
		!Number.isFinite(payload.expiresAt) ||
		payload.expiresAt <= Date.now()
	) {
		throw new errs.AuthError("Invalid OIDC login state. Please restart login.");
	}
	return payload;
};

const readStepUpState = (req) => {
	const raw = req.cookies?.[OIDC_STEPUP_COOKIE];
	if (typeof raw !== "string" || !raw) {
		throw new errs.AuthError("No OIDC step-up state. Please restart sign-in.");
	}
	let payload;
	try {
		payload = JSON.parse(decrypt(raw));
	} catch {
		throw new errs.AuthError("Invalid OIDC step-up state. Please restart sign-in.");
	}
	if (
		payload?.purpose !== STEPUP_STATE_PURPOSE ||
		typeof payload.token !== "string" ||
		!payload.token ||
		!Number.isFinite(payload.expiresAt) ||
		payload.expiresAt <= Date.now()
	) {
		throw new errs.AuthError("Invalid OIDC step-up state. Please restart sign-in.");
	}
	return payload;
};

const findLocalUserByEmail = async (email) => {
	const users = await userModel
		.query()
		.whereRaw("LOWER(TRIM(??)) = ?", ["email", email.toLowerCase().trim()])
		.andWhere("is_deleted", 0)
		.limit(2);
	return users.length === 1 && !users[0].is_disabled ? users[0] : null;
};

const hasLocalPasswordAuth = async (userId) => {
	const { default: authModel } = await import("../models/auth.js");
	const auth = await authModel
		.query()
		.where("user_id", userId)
		.where("type", "password")
		.where("is_deleted", 0)
		.first();
	return Boolean(auth);
};

const auditOidcLinkDenied = async (user, email) => {
	try {
		await internalAuditLog.add(null, {
			action: "user.oidc_link_denied",
			object_type: "user",
			object_id: user.id,
			user_id: user.id,
			actor_type: "system",
			outcome: "denied",
			meta: {
				email,
				reason: "admin_account_with_local_password",
			},
		});
	} catch (error) {
		logger.error(`Could not audit denied OIDC account link: ${error.message}`);
	}
};

/**
 * An IdP assertion for an existing administrator must not take over the local
 * admin account just because both use the same email address. Non-admin
 * accounts continue to link by verified email; an admin with a local password
 * must be linked explicitly (or the OIDC identity reconciled by an operator).
 *
 * @param {any} user
 * @param {string} email
 */
const assertOidcAccountLinkAllowed = async (user, email) => {
	if (!user?.roles?.includes("admin")) {
		return;
	}
	if (!(await hasLocalPasswordAuth(user.id))) {
		return;
	}

	await auditOidcLinkDenied(user, email);
	throw new errs.PermissionError(
		"This email belongs to an administrator account with a local password. OIDC was not linked automatically; sign in locally first.",
	);
};

/**
 * Rebuilds the callback URL from the configured redirect URL and the query
 * string of the incoming request. The host and protocol come exclusively from
 * settings.meta.redirectURL, so a spoofed Host header can neither break nor
 * redirect the token exchange.
 *
 * @param {Setting} settings
 * @param {Request} req
 * @return {URL}
 * */
const buildCallbackUrl = (settings, req) => {
	const currentUrl = getRedirectUri(settings);
	currentUrl.hash = "";
	const originalUrl = typeof req.originalUrl === "string" ? req.originalUrl : "/";
	currentUrl.search = new URL(originalUrl, "http://shieldpm.invalid").search;
	return currentUrl;
};

/**
 * Executes validation of callback parameters.
 *
 * @param {Request} req
 * @param {Setting} settings
 * @return {Promise} a promise resolving to a jwt token
 * */
const validateCallback = async (req, settings) => {
	const { nonce, state, codeVerifier } = readLoginState(req);
	const config = await getConfig(settings);
	const currentUrl = buildCallbackUrl(settings, req);
	const tokens = await client.authorizationCodeGrant(config, currentUrl, {
		expectedNonce: nonce,
		expectedState: state,
		pkceCodeVerifier: codeVerifier,
	});
	const claims = tokens.claims();

	if (!claims.email) {
		throw new errs.AuthError("The Identity Provider didn't send the 'email' claim");
	}

	if (claims.email_verified !== true && claims.email_verified !== "true") {
		throw new errs.AuthError("The Identity Provider has not verified the email address");
	}

	const email = claims.email.toLowerCase();
	logger.info(`Successful authentication for email ${email}`);

	// Local TOTP/WebAuthn/Duo must never be bypassed by an IdP login. Issue a
	// short-lived pending token instead of a session and let the login page ask
	// for the second factor. Accounts enforced onto SSO can use
	// OIDC_ENFORCE_SSO=false as break-glass.
	const localUser = await findLocalUserByEmail(email);
	if (localUser) {
		await assertOidcAccountLinkAllowed(localUser, email);
	}
	if (localUser && (await UserTwoFa.hasActive2FA(localUser.id))) {
		const pending = await TokenModel().create({
			iss: "api",
			attrs: { id: localUser.id },
			scope: ["2fa_pending"],
			expiresIn: "5m",
		});
		try {
			await internalAuditLog.add(null, {
				action: "user.oidc_step_up_required",
				object_type: "user",
				object_id: localUser.id,
				user_id: localUser.id,
				actor_type: "system",
				outcome: "allowed",
				meta: { email },
			});
		} catch (error) {
			logger.error(`Could not audit OIDC step-up requirement: ${error.message}`);
		}
		return { stepUp: pending.token, email };
	}

	const token = await internalToken.getTokenFromOAuthClaim({ identity: email });
	return { ...token, email };
};

const readTokenHandoff = (req) => {
	const raw = req.cookies?.[OIDC_COOKIE];
	if (typeof raw !== "string" || !raw) {
		throw new errs.AuthError("No OIDC cookie found");
	}

	let decrypted;
	try {
		decrypted = decrypt(raw);
	} catch {
		throw new errs.AuthError("Invalid OIDC cookie");
	}

	const [token, expires] = decrypted.split("---");
	if (!token || !expires) {
		throw new errs.AuthError("Invalid token data in cookie");
	}
	return token;
};

const redirectToAuthorizationURL = (req, res, params) => {
	const expiresAt = Date.now() + LOGIN_STATE_TTL_MS;
	const state = JSON.stringify({
		purpose: LOGIN_STATE_PURPOSE,
		nonce: params.nonce,
		state: params.state,
		codeVerifier: params.codeVerifier,
		expiresAt,
	});
	res.cookie(OIDC_COOKIE, encrypt(state), {
		httpOnly: true,
		secure: req.secure,
		sameSite: "lax",
		maxAge: LOGIN_STATE_TTL_MS,
	});
	res.redirect(params.url);
};

const redirectToStepUp = (req, res, token) => {
	const payload = JSON.stringify({
		purpose: STEPUP_STATE_PURPOSE,
		token,
		expiresAt: Date.now() + STEPUP_STATE_TTL_MS,
	});
	// The verified OIDC first factor replaces this browser's previous session;
	// an old session must not survive while the second factor is pending.
	clearAuthCookies(res);
	clearDuoCookie(res, req);
	res.clearCookie("shieldpm_jwt_original");
	res.clearCookie(OIDC_COOKIE);
	res.cookie(OIDC_STEPUP_COOKIE, encrypt(payload), {
		httpOnly: true,
		secure: req.secure,
		sameSite: "lax",
		maxAge: STEPUP_STATE_TTL_MS,
	});
	res.redirect("/login?stepup=1");
};

const redirectWithJwtToken = (req, res, token) => {
	const payload = `${token.token}---${token.expires}`;
	const encrypted = encrypt(payload);
	// The verified OIDC login replaces this browser's previous session. Otherwise
	// startup refresh would restore the old identity before the claim can run.
	clearAuthCookies(res);
	clearDuoCookie(res, req);
	res.clearCookie("shieldpm_jwt_original");
	res.cookie(OIDC_COOKIE, encrypted, {
		httpOnly: true,
		secure: req.secure,
		sameSite: "lax",
		maxAge: LOGIN_STATE_TTL_MS,
	});
	res.redirect("/");
};

const redirectWithError = (res, error) => {
	logger.error(`Callback error:  ${error.message}`);
	res.cookie("shieldpm_oidc_error", error.public ? error.message : "OIDC authentication failed", {
		secure: true,
		sameSite: "Strict",
	});
	res.redirect("/login");
};

export default router;
