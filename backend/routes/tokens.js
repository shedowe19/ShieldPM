import express from "express";
import internalToken from "../internal/token.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { debug, express as logger } from "../logger.js";
import TokenModel from "../models/token.js";
import User from "../models/user.js";
import { getValidationSchema } from "../schema/index.js";

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
	.get(jwtdecode(), async (req, res, next) => {
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
		})

	/**
	 * POST /tokens
	 *
	 * Create a new Token
	 */
	.post(async (req, res, next) => {
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

			// Set Cookie
			res.cookie("shieldpm_jwt", result.token, {
				httpOnly: true,
				secure: req.secure || req.headers["x-forwarded-proto"] === "https",
				sameSite: "strict",
				maxAge: result.expires ? new Date(result.expires).getTime() - Date.now() : undefined,
			});

			res.status(200).send({ ...result, token: undefined }); // Omit token
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

	.delete(async (_req, res) => {
		res.clearCookie("shieldpm_jwt");
		res.clearCookie("shieldpm_jwt_original");
		res.sendStatus(204);
	});

router
	.route("/restore")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.post(async (req, res) => {
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
				secure: req.secure || req.headers["x-forwarded-proto"] === "https",
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

export default router;
