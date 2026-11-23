import express from "express";
import internalSetting, { redactSetting } from "../internal/setting.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import validator from "../lib/validator/index.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Secret-bearing responses must not be stored by browsers, proxies or
 * service-worker caches.
 */
const noStore = (_req, res, next) => {
	res.set("Cache-Control", "no-store");
	next();
};

/**
 * /api/settings
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode(), noStore)

	/**
	 * GET /api/settings
	 *
	 * Retrieve all settings. Secret meta values are masked for every caller,
	 * including administrators: the API reports `<field>_configured` instead of
	 * the stored value, so a browser/HAR/log leak cannot disclose credentials.
	 */
	.get(async (_req, res) => {
		const rows = await internalSetting.getAll(res.locals.access);
		res.status(200).send(rows);
	});

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
	.all(jwtdecode(), noStore)

	/**
	 * GET /settings/something
	 *
	 * Retrieve a specific setting
	 */
	.get(async (req, res) => {
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
		const row = await internalSetting.get(
			res.locals.access,
			{
				id: data.setting_id,
			},
			{ redactSecrets: true },
		);
		if (row.id === "oidc-config") {
			// Redact oidc configuration via api (unauthenticated get call)
			const m = row.meta;
			row.meta = {
				name: m.name,
				enabled:
					m.enabled === true &&
					!!m.clientSecret_configured &&
					!!m.clientID &&
					!!m.issuerURL &&
					!!m.redirectURL &&
					!!m.name,
			};

			// Remove these temporary cookies used during oidc authentication
			res.clearCookie("shieldpm_oidc");
			res.clearCookie("shieldpm_oidc_error");
		}
		res.status(200).send(row);
	})

	/**
	 * PUT /api/settings/something
	 *
	 * Update and existing setting
	 */
	.put(async (req, res) => {
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
		const payload = await apiValidator(getValidationSchema("/settings/{settingID}", "put"), req.body);
		payload.id = params.setting_id;
		const result = await internalSetting.update(res.locals.access, payload);
		// Never echo a freshly written secret back to the browser.
		res.status(200).send(redactSetting(result));
	});

export default router;
