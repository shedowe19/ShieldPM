import express from "express";
import internalToken from "../internal/token.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const loginAttempts = new Map();

// Clean up login attempts every 15 minutes to prevent memory leaks
setInterval(() => {
	const now = Date.now();
	for (const [ip, data] of loginAttempts.entries()) {
		if (now > data.blockedUntil && now - data.lastAttempt > 900000) {
			loginAttempts.delete(ip);
		}
	}
}, 900000);

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
	.get(jwtdecode(), async (req, res, next) => {
		try {
			// Backwards compatibility: Check header first, then cookie
			// Actually jwtdecode middleware handles header -> res.locals.access
			// If we want to support cookie-based refresh loop:
			// The `jwtdecode` middleware needs to be updated too, but for now let's assume valid access token is present

			const data = await internalToken.getFreshToken(res.locals.access, {
				expiry: typeof req.query.expiry !== "undefined" ? req.query.expiry : null,
				scope: typeof req.query.scope !== "undefined" ? req.query.scope : null,
			});

			// Set new cookie
			res.cookie("shieldpm_jwt", data.token, {
				httpOnly: true,
				secure: req.secure || req.headers["x-forwarded-proto"] === "https",
				sameSite: "strict",
				maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days (example, matches typical expiry)
			});

			// clear this temporary cookie following a successful oidc authentication
			res.clearCookie("shieldpm_oidc");
			res.status(200).send({ ...data, token: undefined }); // Don't send token in body
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /tokens
	 *
	 * Create a new Token
	 */
	.post(async (req, res, next) => {
		const ip = req.ip;
		const now = Date.now();

		// DoS Protection: Cap the memory usage of the rate limiter
		if (loginAttempts.size > 5000 && !loginAttempts.has(ip)) {
			// If map is full and IP is new, reject or prune. Pruning is safer for legit users.
			// Simple strategy: Clear the map if it gets too big (Heavy handed but effective against exhaustion)
			// Better: Do not track new IPs if full, but that allows bruteforce.
			// Best generically without Redis: Clear 10% or just clear all.
			logger.warn("Login Rate Limiter full, flushing memory.");
			loginAttempts.clear();
		}

		const attempts = loginAttempts.get(ip) || { count: 0, blockedUntil: 0, lastAttempt: 0 };

		if (now < attempts.blockedUntil) {
			res.status(429).send({
				error: {
					code: 429,
					message: "Too many login attempts. Please try again later.",
				},
			});
			return;
		}

		try {
			const data = await apiValidator(getValidationSchema("/tokens", "post"), req.body);
			const result = await internalToken.getTokenFromEmail(data);
			loginAttempts.delete(ip);

			// Set Cookie
			res.cookie("shieldpm_jwt", result.token, {
				httpOnly: true,
				secure: req.secure || req.headers["x-forwarded-proto"] === "https",
				sameSite: "strict",
				maxAge: result.expires ? new Date(result.expires).getTime() - Date.now() : undefined,
			});

			res.status(200).send({ ...result, token: undefined }); // Omit token
		} catch (err) {
			attempts.count++;
			attempts.lastAttempt = now;
			if (attempts.count >= 5) {
				attempts.blockedUntil = now + 900000; // Block for 15 minutes
				logger.warn(`IP ${ip} blocked due to too many failed login attempts.`);
			}
			loginAttempts.set(ip, attempts);

			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			// Small delay to deter timing attacks
			await new Promise((resolve) => setTimeout(resolve, 500));
			next(err);
		}
	})

	.delete(async (req, res) => {
		res.clearCookie("shieldpm_jwt");
		res.sendStatus(204);
	});

export default router;
