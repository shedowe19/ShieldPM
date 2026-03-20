import express from "express";
import rateLimit from "express-rate-limit";
import { clearAuthCookies } from "../lib/auth-cookies.js";
import internalToken from "../internal/token.js";
import { twoFaService } from "../modules/auth/index.js";
import {
	clearLoginAttempts,
	cleanupExpiredLoginAttempts,
	getLoginAttemptState,
	normalizeLoginIdentifier,
	registerFailedLoginAttempt,
} from "../modules/auth/login-attempts.js";
import { createPendingTwoFaChallenge, loadPendingTwoFaPayload, loadPendingTwoFaUser } from "../modules/auth/pending-2fa.js";
import { issueAuthResponse } from "../modules/auth/token-response.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { debug, express as logger } from "../logger.js";
import TokenModel from "../models/token.js";
import User from "../models/user.js";
import UserTwoFa from "../models/user-2fa.js";
import { getValidationSchema } from "../schema/index.js";

const authRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 30,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: { code: 429, message: "Too many requests, please try again later." } },
});

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });

const revokeRefreshSession = async (rawRefreshToken, reason = "logout") => {
	if (!rawRefreshToken) return;
	const AuthSession = (await import("../models/auth-session.js")).default;
	const lookup = AuthSession.buildLookup(rawRefreshToken);
	const session = await AuthSession.query().findOne(lookup);
	if (session && !session.revoked_at) {
		await internalToken.revokeSession(session.id, reason);
	}
};

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(authRateLimiter, jwtdecode(), async (req, res) => {
		logger.warn(`Legacy GET /tokens accessed from IP ${req.ip || "unknown"} - migrate to POST /tokens/refresh`);
		const expiry = typeof req.query.expiry === "string" ? req.query.expiry : null;
		const scope = typeof req.query.scope === "string" ? req.query.scope : null;
		const data = await internalToken.getFreshToken(res.locals.access, { expiry, scope });
		res.cookie("shieldpm_jwt", data.token, {
			httpOnly: true,
			secure: req.secure,
			sameSite: "strict",
			maxAge: data.expires ? Math.max(0, new Date(data.expires).getTime() - Date.now()) : undefined,
		});
		res.clearCookie("shieldpm_oidc");
		res.status(200).send({ ...data, token: undefined });
	})
	.post(authRateLimiter, async (req, res, next) => {
		const ip = req.ip || "unknown";
		const now = Date.now();
		const loginIdentifier = normalizeLoginIdentifier(req.body);
		const trackedIdentifiers = [{ scope: "ip", identifier: ip }, ...(loginIdentifier ? [{ scope: "login", identifier: loginIdentifier }] : [])];

		try {
			await cleanupExpiredLoginAttempts(now);
			for (const tracked of trackedIdentifiers) {
				const state = await getLoginAttemptState(tracked.scope, tracked.identifier, now);
				if (state.blockedUntil > now) {
					return res.status(429).send({ error: { code: 429, message: "Too many login attempts. Please try again later." } });
				}
			}

			const data = await apiValidator(getValidationSchema("/tokens", "post"), req.body);
			const result = await internalToken.getTokenFromEmail(data);
			await clearLoginAttempts(trackedIdentifiers);
			const has2FA = await UserTwoFa.hasActive2FA(result.user.id);
			if (has2FA) {
				return res.status(202).send(await createPendingTwoFaChallenge(result.user.id, res.locals.csrfToken));
			}

			res.status(200).send(
				await issueAuthResponse({
					internalToken,
					user: result.user,
					scope: data.scope || "user",
					req,
					res,
					csrfToken: res.locals.csrfToken,
				}),
			);
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
			await new Promise((resolve) => setTimeout(resolve, 500));
			next(err);
		}
	})
	.delete(async (req, res) => {
		const rawRefreshToken = req.cookies?.shieldpm_refresh || req.body?.refresh_token;
		if (rawRefreshToken) {
			try {
				await revokeRefreshSession(rawRefreshToken, "logout");
			} catch (err) {
				debug(logger, `Failed to revoke refresh session on logout: ${err}`);
			}
		}
		clearAuthCookies(res);
		res.clearCookie("shieldpm_jwt_original");
		res.sendStatus(204);
	});

router.post("/refresh", authRateLimiter, async (req, res) => {
	try {
		const rawRefreshToken = req.cookies?.shieldpm_refresh || req.body?.refresh_token;
		if (!rawRefreshToken) {
			return res.status(400).send({ error: { code: 400, message: "Missing refresh token" } });
		}
		const meta = { ip: req.ip || "unknown", userAgent: req.headers["user-agent"] || null };
		const pair = await internalToken.refreshTokenPair(rawRefreshToken, meta);
		res.status(200).send(
			await issueAuthResponse({ internalToken: { issueTokenPair: async () => pair }, user: pair.user, req, res, csrfToken: res.locals.csrfToken }),
		);
	} catch (err) {
		debug(logger, `POST /tokens/refresh: ${err}`);
		const code = err instanceof errs.AuthError || err instanceof errs.UnauthorizedError ? 401 : 500;
		clearAuthCookies(res);
		res.status(code).send({ error: { code, message: err.message || "Token refresh failed" } });
	}
});

router.post("/logout", authRateLimiter, async (req, res) => {
	const rawRefreshToken = req.cookies?.shieldpm_refresh || req.body?.refresh_token;
	if (rawRefreshToken) {
		try {
			await revokeRefreshSession(rawRefreshToken, "logout");
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
				return res.status(400).send({ error: { code: 400, message: "No backup session found to restore." } });
			}
			let payload;
			try {
				const Token = TokenModel();
				payload = await Token.load(originalToken);
			} catch {
				throw new errs.AuthError("Backup session token is invalid or expired");
			}
			res.cookie("shieldpm_jwt", originalToken, {
				httpOnly: true,
				secure: req.secure,
				sameSite: "strict",
				maxAge: payload.exp ? payload.exp * 1000 - Date.now() : undefined,
			});
			res.clearCookie("shieldpm_jwt_original");
			res.status(200).send({ expires: payload.exp ? new Date(payload.exp * 1000).toISOString() : null, user: { id: payload.attrs?.id || payload.id } });
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			res.clearCookie("shieldpm_jwt_original");
			const code = err instanceof errs.AuthError ? 401 : 400;
			res.status(code).send({ error: { code, message: "Failed to restore session. Token invalid or expired." } });
		}
	});

router.post("/2fa/verify", authRateLimiter, async (req, res) => {
	const { pending_token, method, code } = req.body;
	if (!pending_token || !method || !code) {
		return res.status(400).send({ error: { code: 400, message: "pending_token, method, and code are required" } });
	}
	try {
		const { userId, user } = await loadPendingTwoFaUser(pending_token);
		if (!user) return res.status(401).send({ error: { code: 401, message: "User not found" } });
		const valid = await twoFaService.verifyLoginChallenge(userId, method, code);
		if (!valid) return res.status(401).send({ error: { code: 401, message: "Invalid 2FA code" } });
		res.status(200).send(await issueAuthResponse({ internalToken, user, req, res, csrfToken: res.locals.csrfToken }));
	} catch (err) {
		debug(logger, `POST /tokens/2fa/verify: ${err}`);
		const code = err.status || 500;
		res.status(code).send({ error: { code, message: err.public ? err.message : "2FA verification failed" } });
	}
});

router.post("/2fa/passkey/begin", authRateLimiter, async (req, res) => {
	const { pending_token } = req.body;
	if (!pending_token) return res.status(400).send({ error: { code: 400, message: "pending_token is required" } });
	try {
		const payload = await loadPendingTwoFaPayload(pending_token);
		const { options, challengeId } = await twoFaService.beginPasskeyAuthentication(payload.attrs.id, req);
		res.status(200).json({ options, challenge_id: challengeId });
	} catch (err) {
		debug(logger, `POST /tokens/2fa/passkey/begin: ${err}`);
		const code = err.status || 500;
		res.status(code).send({ error: { code, message: err.public ? err.message : "Failed to begin passkey authentication" } });
	}
});

router.post("/2fa/passkey/complete", authRateLimiter, async (req, res) => {
	const { pending_token, challenge_id, auth_response } = req.body;
	if (!pending_token || !challenge_id || !auth_response) {
		return res.status(400).send({ error: { code: 400, message: "pending_token, challenge_id, and auth_response are required" } });
	}
	try {
		const { userId, user } = await loadPendingTwoFaUser(pending_token);
		if (!user) return res.status(401).send({ error: { code: 401, message: "User not found" } });
		await twoFaService.completePasskeyAuthentication(userId, challenge_id, auth_response, req);
		res.status(200).send(await issueAuthResponse({ internalToken, user, req, res, csrfToken: res.locals.csrfToken }));
	} catch (err) {
		debug(logger, `POST /tokens/2fa/passkey/complete: ${err}`);
		const code = err.status || 500;
		res.status(code).send({ error: { code, message: err.public ? err.message : "Passkey authentication failed" } });
	}
});

router.post("/2fa/duo/begin", authRateLimiter, async (req, res) => {
	const { pending_token } = req.body;
	if (!pending_token) return res.status(400).send({ error: { code: 400, message: "pending_token is required" } });
	try {
		const { userId, user } = await loadPendingTwoFaUser(pending_token);
		if (!user) return res.status(401).send({ error: { code: 401, message: "User not found" } });
		const { authUrl, state } = await twoFaService.beginDuoAuthentication(userId, user.email);
		res.status(200).json({ auth_url: authUrl, state });
	} catch (err) {
		debug(logger, `POST /tokens/2fa/duo/begin: ${err}`);
		const code = err.status || 500;
		res.status(code).send({ error: { code, message: err.public ? err.message : "Failed to initiate Duo authentication" } });
	}
});

router.post("/2fa/duo/complete", authRateLimiter, async (req, res) => {
	const { pending_token, duo_code } = req.body;
	if (!pending_token || !duo_code) {
		return res.status(400).send({ error: { code: 400, message: "pending_token and duo_code are required" } });
	}
	try {
		const { userId, user } = await loadPendingTwoFaUser(pending_token);
		if (!user) return res.status(401).send({ error: { code: 401, message: "User not found" } });
		const valid = await twoFaService.completeDuoAuthentication(userId, user.email, duo_code);
		if (!valid) return res.status(401).send({ error: { code: 401, message: "Duo authentication failed" } });
		res.status(200).send(await issueAuthResponse({ internalToken, user, req, res, csrfToken: res.locals.csrfToken }));
	} catch (err) {
		debug(logger, `POST /tokens/2fa/duo/complete: ${err}`);
		const code = err.status || 500;
		res.status(code).send({ error: { code, message: err.public ? err.message : "Duo authentication failed" } });
	}
});

export default router;
