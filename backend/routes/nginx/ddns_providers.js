import express from "express";
import { ddnsProviderService } from "../../modules/ddns-provider/index.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/nginx/ddns-providers
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/ddns-providers
	 */
	.get(async (_req, res) => {
		await res.locals.access.can("ddns_providers:list");
		const rows = await ddnsProviderService.getAll(res.locals.access);
		res.status(200).send(rows);
	})

	/**
	 * POST /api/nginx/ddns-providers
	 */
	.post(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/ddns-providers", "post"), req.body);
		await res.locals.access.can("ddns_providers:create", payload);
		const result = await ddnsProviderService.create(res.locals.access, payload);
		res.status(201).send(result);
	});

/**
 * /api/nginx/ddns-providers/:id
 */
router
	.route("/:id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/ddns-providers/:id
	 */
	.get(async (req, res) => {
		await res.locals.access.can("ddns_providers:get", req.params.id);
		const result = await ddnsProviderService.get(res.locals.access, {
			id: Number.parseInt(req.params.id, 10),
		});
		res.status(200).send(result);
	})

	/**
	 * PUT /api/nginx/ddns-providers/:id
	 */
	.put(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/ddns-providers/providerID", "put"), req.body);
		await res.locals.access.can("ddns_providers:update", req.params.id);
		payload.id = Number.parseInt(req.params.id, 10);
		const result = await ddnsProviderService.update(res.locals.access, payload);
		res.status(200).send(result);
	})

	/**
	 * DELETE /api/nginx/ddns-providers/:id
	 */
	.delete(async (req, res) => {
		await res.locals.access.can("ddns_providers:delete", req.params.id);
		const result = await ddnsProviderService.delete(res.locals.access, {
			id: Number.parseInt(req.params.id, 10),
		});
		res.status(200).send(result);
	});

/**
 * /api/nginx/ddns-providers/:id/test
 */
router
	.route("/:id/test")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res) => {
		await res.locals.access.can("ddns_providers:update", req.params.id);
		const result = await ddnsProviderService.test(res.locals.access, {
			id: Number.parseInt(req.params.id, 10),
		});
		res.status(200).send(result);
	});

export default router;
