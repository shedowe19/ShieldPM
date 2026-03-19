import express from "express";
import rateLimit from "express-rate-limit";
import { clearAuthCookies, setAuthCookies } from "../lib/auth-cookies.js";
import internalToken from "../internal/token.js";
import twoFaService from "../internal/2fa-service.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { debug, express as logger } from "../logger.js";
import TokenModel from "../models/token.js";
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
				await knex.schema.createTable(LOGIN_ATTEMPT_TABLE, (table) => {
					table.increments("id").primary();
					table.string("scope", 32).notNullable();
					table.string("identifier", 255).notNullable();
					table.integer("attempt_count").notNullable().defaultTo(0);
					table.bigInteger("first_attempt_at").notNullable();
					table.bigInteger("last_attempt_at").notNullable();
					table.bigInteger("blocked_until").notNullable().defaultTo(0);
					table.unique(["scope", "identifier"]);
					table.index(["last_attempt_at"]);
					table.index(["blocked_until"]);
				});
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

		res.cookie("shieldpm_jwt", data.token, {
			httpOnly: true,
			secure: req.secure,
			sameSite: "strict",
			maxAge: data.expires ? Math.max(0, new Date(data.expires).getTime() - Date.now()) : undefined,
		});

		res.clearCookie("shieldpm_oidc");
		res.status(200).send({ ...data, token: undefined });
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
			const result = await internalToken.getTokenFromEmail(data);
			await clearLoginAttempts(trackedIdentifiers);

			// Check whether the user has any active 2FA methods
			const has2FA = await UserTwoFa.hasActive2FA(result.user.id);

			if (has2FA) {
				// Issue a short-lived "pending 2FA" token (5 minutes)
				const Token = TokenModel();
				const pending = await Token.create({
					iss: "api",
					attrs: { id: result.user.id },
					scope: ["2fa_pending"],
					expiresIn: "5m",
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
			const pair = await internalToken.issueTokenPair(result.user, data.scope || "user", meta);

			// Set both cookies
			setAuthCookies(res, req, {
				accessToken: pair.access_token,
				accessExpires: pair.access_expires,
				refreshToken: pair.refresh_token,
				refreshExpires: pair.refresh_expires,
			});

			// Backward-compatible response (no tokens in body)
			res.status(200).send({
				expires: pair.access_expires,
				user: pair.user,
				csrfToken: res.locals.csrfToken,
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
		// Try to revoke the refresh session if a refresh token is present
		const rawRefreshToken = req.cookies?.shieldpm_refresh || req.body?.refresh_token;
		if (rawRefreshToken) {
			try {
				const AuthSession = (await import("../models/auth-session.js")).default;
				const lookup = AuthSession.buildLookup(rawRefreshToken);
				const session = await AuthSession.query().findOne(lookup);
				if (session && !session.revoked_at) {
					await internalToken.revokeSession(session.id, "logout");
				}
			} catch (err) {
				debug(logger, `Failed to revoke refresh session on logout: ${err}`);
			}
		}

		clearAuthCookies(res);
		res.clearCookie("shieldpm_jwt_original");
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
		const rawRefreshToken = req.cookies?.shieldpm_refresh || req.body?.refresh_token;

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

		// Backward-compatible response (no tokens in body)
		res.status(200).send({
			expires: pair.access_expires,
			user: pair.user,
			csrfToken: res.locals.csrfToken,
		});
	} catch (err) {
		debug(logger, `POST /tokens/refresh: ${err}`);
		const code = err instanceof errs.AuthError || err instanceof errs.UnauthorizedError ? 401 : 500;
		clearAuthCookies(res);
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
	const rawRefreshToken = req.cookies?.shieldpm_refresh || req.body?.refresh_token;

	if (rawRefreshToken) {
		try {
			const AuthSession = (await import("../models/auth-session.js")).default;
			const lookup = AuthSession.buildLookup(rawRefreshToken);
			const session = await AuthSession.query().findOne(lookup);
			if (session && !session.revoked_at) {
				await internalToken.revokeSession(session.id, "logout");
			}
		} catch (err) {
			debug(logger, `POST /tokens/logout: revoke failed: ${err}`);
		}
	}

	clearAuthCookies(res);
	res.clearCookie("shieldpm_jwt_original");
	res.sendStatus(204);
});

router
	.route("/restore")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(authRateLimiter, async (req, res) => {
		try {
			const originalToken = req.cookies?.shieldpm_jwt_original;
			if (!originalToken) {
				return res.status(400).send({
					error: {
						code: 400,
						message: "No backup session found to restore.",
					},
				});
			}

			// Verify the original token to get expiry/user info securely
			let payload;
			try {
				const Token = TokenModel();
				payload = await Token.load(originalToken);
			} catch (verifyErr) {
				throw new errs.AuthError("Backup session token is invalid or expired");
			}

			// Set original token back to main cookie
			res.cookie("shieldpm_jwt", originalToken, {
				httpOnly: true,
				secure: req.secure,
				sameSite: "strict",
				maxAge: payload.exp ? payload.exp * 1000 - Date.now() : undefined,
			});

			// Clear the backup cookie
			res.clearCookie("shieldpm_jwt_original");

			// Respond with user/expiry so frontend AuthStore can update its state
			res.status(200).send({
				expires: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
				user: {
					id: payload.attrs?.id || payload.id,
				},
			});
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			res.clearCookie("shieldpm_jwt_original");
			const code = err instanceof errs.AuthError ? 401 : 400;
			res.status(code).send({
				error: {
					code,
					message: "Failed to restore session. Token invalid or expired.",
				},
			});
		}
	});

// ---------------------------------------------------------------------------
// 2FA verification during login
// ---------------------------------------------------------------------------

/**
 * POST /tokens/2fa/verify
 *
 * Verify a TOTP code, YubiKey OTP, or backup code using a pending 2FA token.
 * On success, issues full access + refresh tokens and sets auth cookies.
 */
router.post("/2fa/verify", authRateLimiter, async (req, res) => {
	const { pending_token, method, code } = req.body;

	if (!pending_token || !method || !code) {
		return res.status(400).send({ error: { code: 400, message: "pending_token, method, and code are required" } });
	}

	try {
		// Verify the short-lived pending token
		const Token = TokenModel();
		let payload;
		try {
			payload = await Token.load(pending_token);
		} catch (_err) {
			return res.status(401).send({ error: { code: 401, message: "Pending 2FA token is invalid or expired" } });
		}

		const scope = payload.scope;
		const scopes = Array.isArray(scope) ? scope : [scope];
		if (!scopes.includes("2fa_pending")) {
			return res.status(401).send({ error: { code: 401, message: "Invalid token scope for 2FA verification" } });
		}

		const userId = payload.attrs?.id;
		if (!userId) {
			return res.status(401).send({ error: { code: 401, message: "Invalid pending token" } });
		}

		// Verify the provided 2FA code
		const valid = await twoFaService.verifyLoginChallenge(userId, method, code);
		if (!valid) {
			return res.status(401).send({ error: { code: 401, message: "Invalid 2FA code" } });
		}

		// 2FA passed — load the user and issue full tokens
		const user = await User.query().findById(userId).andWhere("is_deleted", 0).andWhere("is_disabled", 0);
		if (!user) {
			return res.status(401).send({ error: { code: 401, message: "User not found" } });
		}

		const ip = req.ip || "unknown";
		const meta = { ip, userAgent: req.headers["user-agent"] || null };
		const pair = await internalToken.issueTokenPair(user, "user", meta);

		setAuthCookies(res, req, {
			accessToken: pair.access_token,
			accessExpires: pair.access_expires,
			refreshToken: pair.refresh_token,
			refreshExpires: pair.refresh_expires,
		});

		res.status(200).send({
			expires: pair.access_expires,
			user: pair.user,
			csrfToken: res.locals.csrfToken,
		});
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
router.post("/2fa/passkey/begin", authRateLimiter, async (req, res) => {
	const { pending_token } = req.body;

	if (!pending_token) {
		return res.status(400).send({ error: { code: 400, message: "pending_token is required" } });
	}

	try {
		const Token = TokenModel();
		let payload;
		try {
			payload = await Token.load(pending_token);
		} catch (_err) {
			return res.status(401).send({ error: { code: 401, message: "Pending 2FA token is invalid or expired" } });
		}

		const userId = payload.attrs?.id;
		const { options, challengeId } = await twoFaService.beginPasskeyAuthentication(userId);

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
router.post("/2fa/passkey/complete", authRateLimiter, async (req, res) => {
	const { pending_token, challenge_id, auth_response } = req.body;

	if (!pending_token || !challenge_id || !auth_response) {
		return res
			.status(400)
			.send({ error: { code: 400, message: "pending_token, challenge_id, and auth_response are required" } });
	}

	try {
		const Token = TokenModel();
		let payload;
		try {
			payload = await Token.load(pending_token);
		} catch (_err) {
			return res.status(401).send({ error: { code: 401, message: "Pending 2FA token is invalid or expired" } });
		}

		const userId = payload.attrs?.id;
		await twoFaService.completePasskeyAuthentication(userId, challenge_id, auth_response);

		const user = await User.query().findById(userId).andWhere("is_deleted", 0).andWhere("is_disabled", 0);
		if (!user) {
			return res.status(401).send({ error: { code: 401, message: "User not found" } });
		}

		const ip = req.ip || "unknown";
		const meta = { ip, userAgent: req.headers["user-agent"] || null };
		const pair = await internalToken.issueTokenPair(user, "user", meta);

		setAuthCookies(res, req, {
			accessToken: pair.access_token,
			accessExpires: pair.access_expires,
			refreshToken: pair.refresh_token,
			refreshExpires: pair.refresh_expires,
		});

		res.status(200).send({
			expires: pair.access_expires,
			user: pair.user,
			csrfToken: res.locals.csrfToken,
		});
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
router.post("/2fa/duo/begin", authRateLimiter, async (req, res) => {
	const { pending_token } = req.body;

	if (!pending_token) {
		return res.status(400).send({ error: { code: 400, message: "pending_token is required" } });
	}

	try {
		const Token = TokenModel();
		let payload;
		try {
			payload = await Token.load(pending_token);
		} catch (_err) {
			return res.status(401).send({ error: { code: 401, message: "Pending 2FA token is invalid or expired" } });
		}

		const userId = payload.attrs?.id;
		const user = await User.query().findById(userId);
		if (!user) {
			return res.status(401).send({ error: { code: 401, message: "User not found" } });
		}

		const { authUrl, state } = await twoFaService.beginDuoAuthentication(userId, user.email);
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
router.post("/2fa/duo/complete", authRateLimiter, async (req, res) => {
	const { pending_token, duo_code } = req.body;

	if (!pending_token || !duo_code) {
		return res.status(400).send({ error: { code: 400, message: "pending_token and duo_code are required" } });
	}

	try {
		const Token = TokenModel();
		let payload;
		try {
			payload = await Token.load(pending_token);
		} catch (_err) {
			return res.status(401).send({ error: { code: 401, message: "Pending 2FA token is invalid or expired" } });
		}

		const userId = payload.attrs?.id;
		const user = await User.query().findById(userId).andWhere("is_deleted", 0).andWhere("is_disabled", 0);
		if (!user) {
			return res.status(401).send({ error: { code: 401, message: "User not found" } });
		}

		const valid = await twoFaService.completeDuoAuthentication(userId, user.email, duo_code);
		if (!valid) {
			return res.status(401).send({ error: { code: 401, message: "Duo authentication failed" } });
		}

		const ip = req.ip || "unknown";
		const meta = { ip, userAgent: req.headers["user-agent"] || null };
		const pair = await internalToken.issueTokenPair(user, "user", meta);

		setAuthCookies(res, req, {
			accessToken: pair.access_token,
			accessExpires: pair.access_expires,
			refreshToken: pair.refresh_token,
			refreshExpires: pair.refresh_expires,
		});

		res.status(200).send({
			expires: pair.access_expires,
			user: pair.user,
			csrfToken: res.locals.csrfToken,
		});
	} catch (err) {
		debug(logger, `POST /tokens/2fa/duo/complete: ${err}`);
		const code = err.status || 500;
		res.status(code).send({ error: { code, message: err.public ? err.message : "Duo authentication failed" } });
	}
});

export default router;
