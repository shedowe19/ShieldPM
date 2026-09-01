import express from "express";
import rateLimit from "express-rate-limit";
import twoFaService from "../internal/2fa-service.js";
import authChallengeService from "../internal/auth-challenge-service.js";
import internalToken from "../internal/token.js";
import {
	clearActorRefreshCookie,
	clearAuthCookies,
	getActorRefreshCookie,
	getRefreshCookie,
	setAccessCookie,
	setAuthCookies,
} from "../lib/auth-cookies.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { debug, express as logger } from "../logger.js";
import User from "../models/user.js";
import UserTwoFa from "../models/user-2fa.js";
import { getValidationSchema } from "../schema/index.js";

/**
 * Rate limiter for sensitive auth endpoints (refresh, logout, restore).
 * Complements the per-IP login attempt tracking on POST /tokens.
 */
const authRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 30, // limit each IP to 30 requests per window
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: { code: 429, message: "Too many requests, please try again later." } },
});

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const LOGIN_ATTEMPT_TABLE = "login_attempts";
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_BLOCK_MS = 15 * 60 * 1000;
let loginAttemptTableInitPromise = null;

const getLoginAttemptKnex = () => User.knex();

const normalizeLoginIdentifier = (body) => {
	if (!body || typeof body !== "object") {
		return null;
	}

	const candidates = [body.identity, body.email, body.username];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim()) {
			return candidate.trim().toLowerCase();
		}
	}

	return null;
};

const ensureLoginAttemptStorage = async () => {
	if (!loginAttemptTableInitPromise) {
		loginAttemptTableInitPromise = (async () => {
			const knex = getLoginAttemptKnex();
			const hasTable = await knex.schema.hasTable(LOGIN_ATTEMPT_TABLE);
			if (!hasTable) {
				throw new errs.InternalError("login_attempts migration has not been applied");
			}
		})();
	}

	return loginAttemptTableInitPromise;
};

const cleanupExpiredLoginAttempts = async (now = Date.now()) => {
	await ensureLoginAttemptStorage();
	await getLoginAttemptKnex()(LOGIN_ATTEMPT_TABLE)
		.where("last_attempt_at", "<", now - LOGIN_ATTEMPT_WINDOW_MS)
		.andWhere("blocked_until", "<", now)
		.delete();
};

const getLoginAttemptState = async (scope, identifier, now = Date.now()) => {
	await ensureLoginAttemptStorage();
	const record = await getLoginAttemptKnex()(LOGIN_ATTEMPT_TABLE).where({ scope, identifier }).first();

	if (!record) {
		return { count: 0, blockedUntil: 0 };
	}

	if (record.blocked_until > now) {
		return {
			count: record.attempt_count,
			blockedUntil: record.blocked_until,
		};
	}

	if (now - record.last_attempt_at >= LOGIN_ATTEMPT_WINDOW_MS) {
		await getLoginAttemptKnex()(LOGIN_ATTEMPT_TABLE).where({ scope, identifier }).delete();
		return { count: 0, blockedUntil: 0 };
	}

	return {
		count: record.attempt_count,
		blockedUntil: 0,
	};
};

const registerFailedLoginAttempt = async (scope, identifier, now = Date.now()) => {
	await ensureLoginAttemptStorage();
	const knex = getLoginAttemptKnex();
	const windowMs = LOGIN_ATTEMPT_WINDOW_MS;
	const blockMs = LOGIN_ATTEMPT_BLOCK_MS;
	const limit = LOGIN_ATTEMPT_LIMIT;

	await knex(LOGIN_ATTEMPT_TABLE)
		.insert({
			scope,
			identifier,
			attempt_count: 1,
			first_attempt_at: now,
			last_attempt_at: now,
			blocked_until: 0,
		})
		.onConflict(["scope", "identifier"])
		.merge({
			attempt_count: knex.raw(
				`CASE
					WHEN (? - ${LOGIN_ATTEMPT_TABLE}.last_attempt_at) >= ? THEN 1
					ELSE ${LOGIN_ATTEMPT_TABLE}.attempt_count + 1
				END`,
				[now, windowMs],
			),
			first_attempt_at: knex.raw(
				`CASE
					WHEN (? - ${LOGIN_ATTEMPT_TABLE}.last_attempt_at) >= ? THEN ?
					ELSE ${LOGIN_ATTEMPT_TABLE}.first_attempt_at
				END`,
				[now, windowMs, now],
			),
			last_attempt_at: now,
			blocked_until: knex.raw(
				`CASE
					WHEN (CASE
						WHEN (? - ${LOGIN_ATTEMPT_TABLE}.last_attempt_at) >= ? THEN 1
						ELSE ${LOGIN_ATTEMPT_TABLE}.attempt_count + 1
					END) >= ? THEN ? + ?
					ELSE 0
				END`,
				[now, windowMs, limit, now, blockMs],
			),
		});
};

const clearLoginAttempts = async (identifiers) => {
	await ensureLoginAttemptStorage();
	const filters = identifiers.filter((entry) => entry.identifier);
	if (filters.length === 0) {
		return;
	}

	await getLoginAttemptKnex()(LOGIN_ATTEMPT_TABLE)
		.where((builder) => {
			for (const filter of filters) {
				builder.orWhere({ scope: filter.scope, identifier: filter.identifier });
			}
		})
		.delete();
};

const revokeRequestSessions = async (req) => {
	const refreshTokens = [getRefreshCookie(req), getActorRefreshCookie(req)].filter(Boolean);
	for (const refreshToken of refreshTokens) {
		try {
			await internalToken.revokeByRefreshToken(refreshToken, "logout");
		} catch (error) {
			debug(logger, `Failed to revoke a session on logout: ${error}`);
		}
	}
};

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /tokens
	 *
	 * Get a new Token, given they already have a token they want to refresh
	 * We also piggy back on to this method, allowing admins to get tokens
	 * for services like Job board and Worker.
	 */
	.get(authRateLimiter, jwtdecode(), async (req, res) => {
		logger.warn(`Legacy GET /tokens accessed from IP ${req.ip || "unknown"} – migrate to POST /tokens/refresh`);

		const expiry = typeof req.query.expiry === "string" ? req.query.expiry : null;
		const scope = typeof req.query.scope === "string" ? req.query.scope : null;
		const query = { expiry, scope };
		const data = await internalToken.getFreshToken(res.locals.access, query);

		setAccessCookie(res, req, data.token, data.expires);

		res.clearCookie("shieldpm_oidc");
		res.status(200).send(data);
	})

	/**
	 * POST /tokens
	 *
	 * Create a new Token
	 */
	.post(authRateLimiter, async (req, res, next) => {
		const ip = req.ip || "unknown";
		const now = Date.now();
		const loginIdentifier = normalizeLoginIdentifier(req.body);
		const trackedIdentifiers = [
			{ scope: "ip", identifier: ip },
			...(loginIdentifier ? [{ scope: "login", identifier: loginIdentifier }] : []),
		];

		try {
			await cleanupExpiredLoginAttempts(now);

			for (const tracked of trackedIdentifiers) {
				const state = await getLoginAttemptState(tracked.scope, tracked.identifier, now);
				if (state.blockedUntil > now) {
					return res.status(429).send({
						error: {
							code: 429,
							message: "Too many login attempts. Please try again later.",
						},
					});
				}
			}

			const data = await apiValidator(getValidationSchema("/tokens", "post"), req.body);
			const result = await internalToken.authenticatePassword(data);
			// Keep the IP-wide breadth counter intact. Otherwise an attacker can
			// periodically sign in with their own account to erase failed attempts
			// against many different identities from the same address.
			await clearLoginAttempts(trackedIdentifiers.filter(({ scope }) => scope === "login"));

			// Check whether the user has any active 2FA methods
			const has2FA = await UserTwoFa.hasActive2FA(result.user.id);

			if (has2FA) {
				const pending = await authChallengeService.issue(result.user.id, "login", {
					authentication_methods: result.authentication_methods,
					scope: data.scope || "user",
				});

				// Return which methods are available so the UI can present the right input
				const activeMethods = await UserTwoFa.getActiveForUser(result.user.id);
				const methodTypes = [...new Set(activeMethods.map((m) => m.type))];

				return res.status(202).send({
					requires_2fa: true,
					pending_token: pending.token,
					methods: methodTypes,
					csrfToken: res.locals.csrfToken,
				});
			}

			// No 2FA — issue refresh-token pair alongside the access token
			const meta = { ip, userAgent: req.headers["user-agent"] || null };
			const pair = await internalToken.issueTokenPair(result.user, data.scope || "user", {
				...meta,
				authenticationMethods: result.authentication_methods,
			});

			// Set both cookies
			setAuthCookies(res, req, {
				accessToken: pair.access_token,
				accessExpires: pair.access_expires,
				refreshToken: pair.refresh_token,
				refreshExpires: pair.refresh_expires,
			});

			res.status(200).send({
				token: pair.access_token,
				expires: pair.access_expires,
				user: pair.user,
				csrfToken: res.locals.issueCsrfTokenForFamily(pair.session.family_id),
			});
		} catch (err) {
			try {
				for (const tracked of trackedIdentifiers) {
					await registerFailedLoginAttempt(tracked.scope, tracked.identifier, now);
				}

				const ipState = await getLoginAttemptState("ip", ip, now);
				if (ipState.blockedUntil > now) {
					logger.warn(`IP ${ip} blocked due to too many failed login attempts.`);
				}
			} catch (rateLimitErr) {
				logger.error(`Failed to persist login attempt state for IP ${ip}: ${rateLimitErr.message}`);
			}

			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			// Small delay to deter timing attacks
			await new Promise((resolve) => setTimeout(resolve, 500));
			next(err);
		}
	})

	.delete(async (req, res) => {
		await revokeRequestSessions(req);
		clearAuthCookies(res);
		clearActorRefreshCookie(res);
		res.sendStatus(204);
	});

/**
 * POST /tokens/refresh
 *
 * Exchange a valid refresh token for a new access + refresh token pair.
 * Reads refresh token from cookie first, body fallback.
 */
router.post("/refresh", authRateLimiter, async (req, res) => {
	try {
		const rawRefreshToken = getRefreshCookie(req) || req.body?.refresh_token;

		if (!rawRefreshToken) {
			return res.status(400).send({
				error: { code: 400, message: "Missing refresh token" },
			});
		}

		const meta = { ip: req.ip || "unknown", userAgent: req.headers["user-agent"] || null };
		const pair = await internalToken.refreshTokenPair(rawRefreshToken, meta);

		setAuthCookies(res, req, {
			accessToken: pair.access_token,
			accessExpires: pair.access_expires,
			refreshToken: pair.refresh_token,
			refreshExpires: pair.refresh_expires,
		});

		res.status(200).send({
			token: pair.access_token,
			expires: pair.access_expires,
			user: pair.user,
			csrfToken: res.locals.issueCsrfTokenForFamily(pair.session.family_id),
		});
	} catch (err) {
		debug(logger, `POST /tokens/refresh: ${err}`);
		const code = err.status || 500;
		if (!err.preserveAuthCookies && code === 401) {
			clearAuthCookies(res);
			clearActorRefreshCookie(res);
		}
		res.status(code).send({
			error: { code, message: err.message || "Token refresh failed" },
		});
	}
});

/**
 * POST /tokens/logout
 *
 * Revoke the refresh session and clear all auth cookies.
 */
router.post("/logout", authRateLimiter, async (req, res) => {
	await revokeRequestSessions(req);
	clearAuthCookies(res);
	clearActorRefreshCookie(res);
	res.sendStatus(204);
});

router
	.route("/restore")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(authRateLimiter, async (req, res) => {
		try {
			const pair = await internalToken.restoreImpersonation({
				targetRefreshToken: getRefreshCookie(req),
				actorRefreshToken: getActorRefreshCookie(req),
				meta: { ip: req.ip || "unknown", userAgent: req.headers["user-agent"] || null },
			});
			setAuthCookies(res, req, {
				accessToken: pair.access_token,
				accessExpires: pair.access_expires,
				refreshToken: pair.refresh_token,
				refreshExpires: pair.refresh_expires,
			});
			clearActorRefreshCookie(res);
			res.status(200).send({
				expires: pair.access_expires,
				user: pair.user,
				csrfToken: res.locals.issueCsrfTokenForFamily(pair.session.family_id),
			});
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			clearActorRefreshCookie(res);
			const code = err.status || 400;
			res.status(code).send({
				error: {
					code,
					message: "Failed to restore session. Token invalid or expired.",
				},
			});
		}
	});

/**
 * POST /tokens/step-up
 *
 * Re-authenticate the current DB-bound session before privileged operations.
 * Accounts with MFA receive a one-time challenge that must be completed using
 * the normal /tokens/2fa endpoints; password-only accounts are elevated here.
 */
router.post("/step-up", authRateLimiter, jwtdecode(), async (req, res) => {
	try {
		const access = res.locals.access;
		const userId = Number(access?.token?.getUserId?.(0) || 0);
		const sessionId = Number(access?.token?.get?.("sid") || 0);
		if (!userId || !sessionId || typeof req.body?.current_password !== "string") {
			throw new errs.AuthError("Current password and an active session are required");
		}

		await internalToken.verifyUserPassword(userId, req.body.current_password);
		const has2FA = await UserTwoFa.hasActive2FA(userId);
		if (has2FA) {
			const activeMethods = await UserTwoFa.getActiveForUser(userId);
			const methods = [...new Set(activeMethods.map((method) => method.type))];
			const pending = await authChallengeService.issue(userId, "step_up", {
				authentication_methods: ["pwd"],
				session_id: sessionId,
			});
			return res.status(202).send({
				requires_2fa: true,
				pending_token: pending.token,
				methods,
				csrfToken: res.locals.csrfToken,
			});
		}

		const steppedUp = await internalToken.markSessionRecentlyAuthenticated(access, ["pwd"]);
		setAccessCookie(res, req, steppedUp.token, steppedUp.expires);
		return res.status(200).send({ ...steppedUp, csrfToken: res.locals.csrfToken });
	} catch (error) {
		debug(logger, `POST /tokens/step-up: ${error}`);
		const code = error.status || 401;
		return res.status(code).send({ error: { code, message: error.public ? error.message : "Step-up failed" } });
	}
});

// ---------------------------------------------------------------------------
// 2FA verification during login
// ---------------------------------------------------------------------------

const getChallengeAuthenticationMethods = (challenge, method) => {
	const existing = Array.isArray(challenge.meta?.authentication_methods)
		? challenge.meta.authentication_methods
		: ["pwd"];
	const normalizedMethod = method === "passkey" ? "webauthn" : `mfa:${method}`;
	return [...new Set([...existing, normalizedMethod])];
};

const completeAuthenticationChallenge = async ({ challenge, pendingToken, method, req, res }) => {
	await authChallengeService.consume(pendingToken, challenge.purpose, challenge.user_id);
	const authenticationMethods = getChallengeAuthenticationMethods(challenge, method);

	if (challenge.purpose === "step_up") {
		const access = res.locals.access;
		if (
			!access ||
			Number(access.token.getUserId(0)) !== Number(challenge.user_id) ||
			Number(access.token.get("sid")) !== Number(challenge.meta?.session_id)
		) {
			throw new errs.AuthError("Step-up challenge is not bound to the current session");
		}
		const steppedUp = await internalToken.markSessionRecentlyAuthenticated(access, authenticationMethods);
		setAccessCookie(res, req, steppedUp.token, steppedUp.expires);
		return steppedUp;
	}

	const user = await User.query().findById(challenge.user_id).andWhere("is_deleted", 0).andWhere("is_disabled", 0);
	if (!user) {
		throw new errs.AuthError("User not found");
	}
	const pair = await internalToken.issueTokenPair(user, challenge.meta?.scope || "user", {
		ip: req.ip || "unknown",
		userAgent: req.headers["user-agent"] || null,
		authenticationMethods,
	});
	setAuthCookies(res, req, {
		accessToken: pair.access_token,
		accessExpires: pair.access_expires,
		refreshToken: pair.refresh_token,
		refreshExpires: pair.refresh_expires,
	});
	return {
		token: pair.access_token,
		expires: pair.access_expires,
		user: pair.user,
		csrfToken: res.locals.issueCsrfTokenForFamily(pair.session.family_id),
	};
};

/**
 * POST /tokens/2fa/verify
 *
 * Verify a TOTP code, YubiKey OTP, or backup code using a pending 2FA token.
 * On success, issues full access + refresh tokens and sets auth cookies.
 */
router.post("/2fa/verify", authRateLimiter, jwtdecode(), async (req, res) => {
	const { pending_token, method, code } = req.body;

	if (!pending_token || !method || !code) {
		return res.status(400).send({ error: { code: 400, message: "pending_token, method, and code are required" } });
	}

	try {
		const challenge = await authChallengeService.validate(pending_token, ["login", "step_up"]);

		// Verify the provided 2FA code
		const valid = await twoFaService.verifyLoginChallenge(challenge.user_id, method, code, {
			sessionBinding: `auth-challenge:${challenge.id}`,
			purpose: challenge.purpose,
		});
		if (!valid) {
			return res.status(401).send({ error: { code: 401, message: "Invalid 2FA code" } });
		}

		res.status(200).send(
			await completeAuthenticationChallenge({ challenge, pendingToken: pending_token, method, req, res }),
		);
	} catch (err) {
		debug(logger, `POST /tokens/2fa/verify: ${err}`);
		const code = err.status || 500;
		res.status(code).send({ error: { code, message: err.public ? err.message : "2FA verification failed" } });
	}
});

/**
 * POST /tokens/2fa/passkey/begin
 *
 * Begin passkey authentication during the login 2FA step.
 */
router.post("/2fa/passkey/begin", authRateLimiter, jwtdecode(), async (req, res) => {
	const { pending_token } = req.body;

	if (!pending_token) {
		return res.status(400).send({ error: { code: 400, message: "pending_token is required" } });
	}

	try {
		const challenge = await authChallengeService.validate(pending_token, ["login", "step_up"]);
		const { options, challengeId } = await twoFaService.beginPasskeyAuthentication(challenge.user_id, req, {
			sessionBinding: `auth-challenge:${challenge.id}`,
			purpose: challenge.purpose,
		});

		res.status(200).json({ options, challenge_id: challengeId });
	} catch (err) {
		debug(logger, `POST /tokens/2fa/passkey/begin: ${err}`);
		const code = err.status || 500;
		res.status(code).send({
			error: { code, message: err.public ? err.message : "Failed to begin passkey authentication" },
		});
	}
});

/**
 * POST /tokens/2fa/passkey/complete
 *
 * Complete passkey authentication and issue full tokens.
 */
router.post("/2fa/passkey/complete", authRateLimiter, jwtdecode(), async (req, res) => {
	const { pending_token, challenge_id, auth_response } = req.body;

	if (!pending_token || !challenge_id || !auth_response) {
		return res
			.status(400)
			.send({ error: { code: 400, message: "pending_token, challenge_id, and auth_response are required" } });
	}

	try {
		const challenge = await authChallengeService.validate(pending_token, ["login", "step_up"]);
		await twoFaService.completePasskeyAuthentication(challenge.user_id, challenge_id, auth_response, req, {
			sessionBinding: `auth-challenge:${challenge.id}`,
			purpose: challenge.purpose,
		});
		res.status(200).send(
			await completeAuthenticationChallenge({
				challenge,
				pendingToken: pending_token,
				method: "passkey",
				req,
				res,
			}),
		);
	} catch (err) {
		debug(logger, `POST /tokens/2fa/passkey/complete: ${err}`);
		const code = err.status || 500;
		res.status(code).send({ error: { code, message: err.public ? err.message : "Passkey authentication failed" } });
	}
});

/**
 * POST /tokens/2fa/duo/begin
 *
 * Generate a Duo auth URL for the pending user.
 */
router.post("/2fa/duo/begin", authRateLimiter, jwtdecode(), async (req, res) => {
	const { pending_token } = req.body;

	if (!pending_token) {
		return res.status(400).send({ error: { code: 400, message: "pending_token is required" } });
	}

	try {
		const challenge = await authChallengeService.validate(pending_token, ["login", "step_up"]);
		const user = await User.query().findById(challenge.user_id);
		if (!user) {
			return res.status(401).send({ error: { code: 401, message: "User not found" } });
		}

		const { authUrl, state } = await twoFaService.beginDuoAuthentication(challenge.user_id, user.email, {
			sessionBinding: `auth-challenge:${challenge.id}`,
			purpose: challenge.purpose,
		});
		res.status(200).json({ auth_url: authUrl, state });
	} catch (err) {
		debug(logger, `POST /tokens/2fa/duo/begin: ${err}`);
		const code = err.status || 500;
		res.status(code).send({
			error: { code, message: err.public ? err.message : "Failed to initiate Duo authentication" },
		});
	}
});

/**
 * POST /tokens/2fa/duo/complete
 *
 * Complete Duo authentication and issue full tokens.
 */
router.post("/2fa/duo/complete", authRateLimiter, jwtdecode(), async (req, res) => {
	const { pending_token, duo_code, state } = req.body;

	if (!pending_token || !duo_code || !state) {
		return res
			.status(400)
			.send({ error: { code: 400, message: "pending_token, duo_code, and state are required" } });
	}

	try {
		const challenge = await authChallengeService.validate(pending_token, ["login", "step_up"]);
		const user = await User.query()
			.findById(challenge.user_id)
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0);
		if (!user) {
			return res.status(401).send({ error: { code: 401, message: "User not found" } });
		}

		const valid = await twoFaService.completeDuoAuthentication(challenge.user_id, user.email, duo_code, state, {
			sessionBinding: `auth-challenge:${challenge.id}`,
			purpose: challenge.purpose,
		});
		if (!valid) {
			return res.status(401).send({ error: { code: 401, message: "Duo authentication failed" } });
		}

		res.status(200).send(
			await completeAuthenticationChallenge({
				challenge,
				pendingToken: pending_token,
				method: "duo",
				req,
				res,
			}),
		);
	} catch (err) {
		debug(logger, `POST /tokens/2fa/duo/complete: ${err}`);
		const code = err.status || 500;
		res.status(code).send({ error: { code, message: err.public ? err.message : "Duo authentication failed" } });
	}
});

export default router;
