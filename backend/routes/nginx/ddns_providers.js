import express from "express";
import { ddnsProviderService } from "../../modules/ddns-provider/index.js";
import { auth, validate } from "../../lib/express/middleware.js";
import { asyncHandler } from "../../lib/express/route-handler.js";

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
	.all(auth())

	/**
	 * GET /api/nginx/ddns-providers
	 */
	.get(
		asyncHandler(async (_req, res) => {
			await res.locals.access.can("ddns_providers:list");
			const rows = await ddnsProviderService.getAll(res.locals.access);
			res.status(200).send(rows);
		}),
	)

	/**
	 * POST /api/nginx/ddns-providers
	 */
	.post(
		asyncHandler(async (req, res) => {
			const payload = await validate("/nginx/ddns-providers", "post")(req.body);
			await res.locals.access.can("ddns_providers:create", payload);
			const result = await ddnsProviderService.create(res.locals.access, payload);
			res.status(201).send(result);
		}),
	);

/**
 * /api/nginx/ddns-providers/:id
 */
router
	.route("/:id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /api/nginx/ddns-providers/:id
	 */
	.get(
		asyncHandler(async (req, res) => {
			await res.locals.access.can("ddns_providers:get", req.params.id);
			const result = await ddnsProviderService.get(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
			});
			res.status(200).send(result);
		}),
	)

	/**
	 * PUT /api/nginx/ddns-providers/:id
	 */
	.put(
		asyncHandler(async (req, res) => {
			const payload = await validate("/nginx/ddns-providers/providerID", "put")(req.body);
			await res.locals.access.can("ddns_providers:update", req.params.id);
			payload.id = Number.parseInt(req.params.id, 10);
			const result = await ddnsProviderService.update(res.locals.access, payload);
			res.status(200).send(result);
		}),
	)

	/**
	 * DELETE /api/nginx/ddns-providers/:id
	 */
	.delete(
		asyncHandler(async (req, res) => {
			await res.locals.access.can("ddns_providers:delete", req.params.id);
			const result = await ddnsProviderService.delete(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
			});
			res.status(200).send(result);
		}),
	);

/**
 * /api/nginx/ddns-providers/:id/test
 */
router
	.route("/:id/test")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())
	.post(
		asyncHandler(async (req, res) => {
			await res.locals.access.can("ddns_providers:update", req.params.id);
			const result = await ddnsProviderService.test(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
			});
			res.status(200).send(result);
		}),
	);

export default router;
