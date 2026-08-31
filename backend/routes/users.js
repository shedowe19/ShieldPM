import express from "express";
import fileUpload from "express-fileupload";
import { rateLimit } from "express-rate-limit";

const avatarLimiter = rateLimit({
	windowMs: 1 * 60 * 1000, // 1 minute
	limit: 100, // Limit each IP to 100 requests per 1 minute
	standardHeaders: true,
	legacyHeaders: false,
	validate: {
		trustProxy: false,
	},
});

import { getSetupTokenFromRequest } from "../internal/initial-setup.js";
import internalToken from "../internal/token.js";
import internalUser from "../internal/user.js";
import Access from "../lib/access.js";
import { setActorRefreshCookie, setAuthCookies } from "../lib/auth-cookies.js";
import { isDestructiveTestMode } from "../lib/config.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import userIdFromMe from "../lib/express/user-id-from-me.js";
import apiValidator from "../lib/validator/api.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";
import { isSetup } from "../setup.js";

// Rate limiter for loginAs endpoint
const loginAsRateLimiter = rateLimit({
	windowMs: 1 * 60 * 1000, // 1 minute
	max: 5, // limit each IP to 5 requests per windowMs
	message: { error: "Too many login attempts, please try again later." },
	standardHeaders: true, // Return rate limit info in the RateLimit-* headers
	legacyHeaders: false, // Disable the X-RateLimit-* headers
});

const avatarUpload = fileUpload({
	limits: {
		fileSize: 2 * 1024 * 1024,
	},
	abortOnLimit: true,
	useTempFiles: false,
});

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/users
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/users
	 *
	 * Retrieve all users
	 */
	.get(async (req, res) => {
		const data = await validator(
			{
				additionalProperties: false,
				properties: {
					expand: {
						$ref: "common#/properties/expand",
					},
					query: {
						$ref: "common#/properties/query",
					},
				},
			},
			{
				expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				query: typeof req.query.query === "string" ? req.query.query : null,
			},
		);
		const users = await internalUser.getAll(res.locals.access, data.expand, data.query);
		res.status(200).send(users);
	})

	/**
	 * POST /api/users
	 *
	 * Create a new User
	 */
	.post(async (req, res) => {
		const body = { ...req.body };
		const setupComplete = await isSetup();
		const currentUserId = res.locals.access?.token?.getUserId?.(0) || 0;

		if (!setupComplete) {
			logger.info("Creating initial admin user during first-time setup");
			const access = new Access(null);
			await access.load(true);
			res.locals.access = access;

			body.is_disabled = false;
			if (typeof body.roles !== "object" || body.roles === null) {
				body.roles = [];
			}
			if (!body.roles.includes("admin")) {
				body.roles.push("admin");
			}
		} else if (!currentUserId) {
			throw new errs.PermissionError(
				"Initial setup is already complete. Authenticated user creation is required.",
			);
		}

		const payload = await apiValidator(getValidationSchema("/users", "post"), body);
		const user = !setupComplete
			? await internalUser.createInitialAdmin(res.locals.access, payload, getSetupTokenFromRequest(req), {
					ip: req.ip || null,
				})
			: await internalUser.create(res.locals.access, payload);
		res.status(201).send(user);
	})

	/**
	 * DELETE /api/users
	 *
	 * Deletes ALL users. This is NOT GENERALLY AVAILABLE!
	 * (!) It is NOT an authenticated endpoint.
	 * (!) Only CI should be able to call this endpoint. As a result,
	 *
	 * it will only work when the env vars CI=true AND NPM_CI_ENABLE_DESTRUCTIVE_TEST_MODE=true
	 *
	 * Do NOT set those env vars in a production environment!
	 */
	.delete(async (_req, res, next) => {
		if (isDestructiveTestMode()) {
			logger.warn("Deleting all users - Destructive Test Mode enabled, allowing this operation");
			await internalUser.deleteAll();
			res.status(200).send(true);
			return;
		}

		next(new errs.ItemNotFoundError());
	});

/**
 * Specific user
 *
 * /api/users/123
 */
router
	.route("/:user_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)

	/**
	 * GET /users/123 or /users/me
	 *
	 * Retrieve a specific user
	 */
	.get(async (req, res) => {
		const data = await validator(
			{
				required: ["user_id"],
				additionalProperties: false,
				properties: {
					user_id: {
						$ref: "common#/properties/id",
					},
					expand: {
						$ref: "common#/properties/expand",
					},
				},
			},
			{
				user_id: req.params.user_id,
				expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
			},
		);

		const user = await internalUser.get(res.locals.access, {
			id: data.user_id,
			expand: data.expand,
			omit: internalUser.getUserOmisionsByAccess(res.locals.access, data.user_id),
		});
		res.status(200).send(user);
	})

	/**
	 * PUT /api/users/123
	 *
	 * Update and existing user
	 */
	.put(async (req, res, _next) => {
		const params = await validator(
			{
				required: ["user_id"],
				additionalProperties: false,
				properties: {
					user_id: { $ref: "common#/properties/id" },
				},
			},
			{ user_id: req.params.user_id },
		);
		const payload = await apiValidator(getValidationSchema("/users/{userID}", "put"), req.body);
		payload.id = params.user_id;
		const result = await internalUser.update(res.locals.access, payload);
		res.status(200).send(result);
	})

	/**
	 * DELETE /api/users/123
	 *
	 * Update and existing user
	 */
	.delete(async (req, res, _next) => {
		const params = await validator(
			{
				required: ["user_id"],
				additionalProperties: false,
				properties: {
					user_id: { $ref: "common#/properties/id" },
				},
			},
			{ user_id: req.params.user_id },
		);
		const result = await internalUser.delete(res.locals.access, {
			id: params.user_id,
		});
		res.status(200).send(result);
	});

/**
 * Avatar Upload
 * POST /api/users/:user_id/avatar
 */
router
	.route("/:user_id/avatar")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)
	.post(avatarUpload, async (req, res) => {
		if (!req.files || Object.keys(req.files).length === 0) {
			throw new errs.ValidationError("No files were uploaded.");
		}

		const result = await internalUser.uploadAvatar(res.locals.access, {
			id: req.params.user_id,
			file: req.files.avatar || req.files.file,
		});
		res.status(200).send(result);
	});

/**
 * Get Avatar Image
 * GET /api/users/:user_id/avatar/image
 */
router
	.route("/:user_id/avatar/image")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.get(avatarLimiter, async (req, res) => {
		try {
			const avatar = await internalUser.getAvatarImage(new Access("public"), {
				id: req.params.user_id,
			});
			res.setHeader("Content-Type", avatar.mimeType);
			res.setHeader("X-Content-Type-Options", "nosniff");
			res.sendFile(avatar.filePath);
		} catch (err) {
			// Don't log 404s for avatars to keep logs clean
			if (!(err instanceof errs.ItemNotFoundError)) {
				debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			}
			res.sendStatus(404);
		}
	});

router.route("/:user_id"); // Resume existing routes

/**
 * Specific user auth
 *
 * /api/users/123/auth
 */
router
	.route("/:user_id/auth")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)

	/**
	 * PUT /api/users/123/auth
	 *
	 * Update password for a user
	 */
	.put(async (req, res) => {
		const params = await validator(
			{
				required: ["user_id"],
				additionalProperties: false,
				properties: {
					user_id: { $ref: "common#/properties/id" },
				},
			},
			{ user_id: req.params.user_id },
		);
		const payload = await apiValidator(getValidationSchema("/users/{userID}/auth", "put"), req.body);
		payload.id = params.user_id;
		const result = await internalUser.setPassword(res.locals.access, payload);
		res.status(200).send(result);
	});

/**
 * Specific user permissions
 *
 * /api/users/123/permissions
 */
router
	.route("/:user_id/permissions")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.all(userIdFromMe)

	/**
	 * PUT /api/users/123/permissions
	 *
	 * Set some or all permissions for a user
	 */
	.put(async (req, res) => {
		const params = await validator(
			{
				required: ["user_id"],
				additionalProperties: false,
				properties: {
					user_id: { $ref: "common#/properties/id" },
				},
			},
			{ user_id: req.params.user_id },
		);
		const payload = await apiValidator(getValidationSchema("/users/{userID}/permissions", "put"), req.body);
		payload.id = params.user_id;
		const result = await internalUser.setPermissions(res.locals.access, payload);
		res.status(200).send(result);
	});

/**
 * Specific user login as
 *
 * /api/users/123/login
 */
router
	.route("/:user_id/login")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(loginAsRateLimiter, async (req, res) => {
		const params = await validator(
			{
				required: ["user_id"],
				additionalProperties: false,
				properties: {
					user_id: { $ref: "common#/properties/id" },
				},
			},
			{ user_id: req.params.user_id },
		);

		const targetUser = await internalUser.loginAs(res.locals.access, {
			id: Number(params.user_id),
		});
		const result = await internalToken.issueImpersonationPair({
			actorSessionId: res.locals.access.token.get("sid"),
			actorUserId: res.locals.access.token.getUserId(0),
			targetUser,
			meta: { ip: req.ip || "unknown", userAgent: req.headers["user-agent"] || null },
		});

		setActorRefreshCookie(res, req, result.actor.refresh_token, result.actor.refresh_expires);
		setAuthCookies(res, req, {
			accessToken: result.pair.access_token,
			accessExpires: result.pair.access_expires,
			refreshToken: result.pair.refresh_token,
			refreshExpires: result.pair.refresh_expires,
		});

		res.status(200).send({
			expires: result.pair.access_expires,
			user: result.pair.user,
			csrfToken: res.locals.issueCsrfTokenForFamily(result.pair.session.family_id),
		});
	});

export default router;
