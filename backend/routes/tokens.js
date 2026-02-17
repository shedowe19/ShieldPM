import express from "express";
import rateLimit from "express-rate-limit";
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

// Rate limiter for login: max 5 failed attempts per 15 minutes per IP
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 5, // limit each IP to 5 requests per windowMs
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
	message: {
		error: {
			code: 429,
			message: "Too many login attempts. Please try again later.",
		},
	},
	skipSuccessfulRequests: true, // Only count failed requests
	validate: {
		trustProxy: false,
	},
});

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
	.post(loginLimiter, async (req, res, next) => {
		try {
			const data = await apiValidator(getValidationSchema("/tokens", "post"), req.body);
			const result = await internalToken.getTokenFromEmail(data);

			// Set Cookie
			res.cookie("shieldpm_jwt", result.token, {
				httpOnly: true,
				secure: req.secure || req.headers["x-forwarded-proto"] === "https",
				sameSite: "strict",
				maxAge: result.expires ? new Date(result.expires).getTime() - Date.now() : undefined,
			});

			res.status(200).send({ ...result, token: undefined }); // Omit token
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			// Small delay to deter timing attacks
			await new Promise((resolve) => setTimeout(resolve, 500));
			next(err);
		}
	})

	.delete(async (_req, res) => {
		res.clearCookie("shieldpm_jwt");
		res.sendStatus(204);
	});

export default router;
