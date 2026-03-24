import express from "express";
import { settingService } from "../modules/setting/index.js";
import { auth, validate } from "../lib/express/middleware.js";
import { asyncHandler } from "../lib/express/route-handler.js";
import validator from "../lib/validator/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/settings
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /api/settings
	 *
	 * Retrieve all settings
	 */
	.get(
		asyncHandler(async (_req, res) => {
			const rows = await settingService.getAll(res.locals.access);
			res.status(200).send(rows);
		}),
	);

/**
 * Specific setting
 *
 * /api/settings/something
 */
router
	.route("/:setting_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /settings/something
	 *
	 * Retrieve a specific setting
	 */
	.get(
		asyncHandler(async (req, res) => {
			const data = await validator(
				{
					required: ["setting_id"],
					additionalProperties: false,
					properties: {
						setting_id: {
							type: "string",
							minLength: 1,
						},
					},
				},
				{
					setting_id: req.params.setting_id,
				},
			);
			const row = await settingService.get(res.locals.access, {
				id: data.setting_id,
			});
			if (row.id === "oidc-config") {
				// Redact oidc configuration via api (unauthenticated get call)
				const m = row.meta;
				row.meta = {
					name: m.name,
					enabled:
						m.enabled === true &&
						!!(m.clientID && m.clientSecret && m.issuerURL && m.redirectURL && m.name),
				};

				// Remove these temporary cookies used during oidc authentication
				res.clearCookie("shieldpm_oidc");
				res.clearCookie("shieldpm_oidc_error");
			}
			res.status(200).send(row);
		}),
	)

	/**
	 * PUT /api/settings/something
	 *
	 * Update and existing setting
	 */
	.put(
		asyncHandler(async (req, res) => {
			const params = await validator(
				{
					required: ["setting_id"],
					additionalProperties: false,
					properties: {
						setting_id: {
							type: "string",
							minLength: 1,
						},
					},
				},
				{ setting_id: req.params.setting_id },
			);
			const payload = await validate("/settings/{settingID}", "put")(req.body);
			payload.id = params.setting_id;
			const result = await settingService.update(res.locals.access, payload);
			res.status(200).send(result);
		}),
	);

export default router;
