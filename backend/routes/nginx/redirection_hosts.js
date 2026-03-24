import express from "express";
import { redirectionHostService } from "../../modules/redirection-host/index.js";
import { auth, validate } from "../../lib/express/middleware.js";
import { asyncHandler } from "../../lib/express/route-handler.js";
import validator from "../../lib/validator/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/nginx/redirection-hosts
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /api/nginx/redirection-hosts
	 *
	 * Retrieve all redirection-hosts
	 */
	.get(
		asyncHandler(async (req, res) => {
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
			const rows = await redirectionHostService.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		}),
	)

	/**
	 * POST /api/nginx/redirection-hosts
	 *
	 * Create a new redirection-host
	 */
	.post(
		asyncHandler(async (req, res) => {
			const payload = await validate("/nginx/redirection-hosts", "post")(req.body);
			const result = await redirectionHostService.create(res.locals.access, payload);
			res.status(201).send(result);
		}),
	);

/**
 * Specific redirection-host
 *
 * /api/nginx/redirection-hosts/123
 */
router
	.route("/:host_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /api/nginx/redirection-hosts/123
	 *
	 * Retrieve a specific redirection-host
	 */
	.get(
		asyncHandler(async (req, res) => {
			const data = await validator(
				{
					required: ["host_id"],
					additionalProperties: false,
					properties: {
						host_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					host_id: req.params.host_id,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);
			const row = await redirectionHostService.get(res.locals.access, {
				id: Number.parseInt(data.host_id, 10),
				expand: data.expand,
			});
			res.status(200).send(row);
		}),
	)

	/**
	 * PUT /api/nginx/redirection-hosts/123
	 *
	 * Update and existing redirection-host
	 */
	.put(
		asyncHandler(async (req, res) => {
			const payload = await validate("/nginx/redirection-hosts/{hostID}", "put")(req.body);
			payload.id = Number.parseInt(req.params.host_id, 10);
			const result = await redirectionHostService.update(res.locals.access, payload);
			res.status(200).send(result);
		}),
	)

	/**
	 * DELETE /api/nginx/redirection-hosts/123
	 *
	 * Update and existing redirection-host
	 */
	.delete(
		asyncHandler(async (req, res) => {
			const result = await redirectionHostService.delete(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		}),
	);

/**
 * Enable redirection-host
 *
 * /api/nginx/redirection-hosts/123/enable
 */
router
	.route("/:host_id/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * POST /api/nginx/redirection-hosts/123/enable
	 */
	.post(
		asyncHandler(async (req, res) => {
			const result = await redirectionHostService.enable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		}),
	);

/**
 * Disable redirection-host
 *
 * /api/nginx/redirection-hosts/123/disable
 */
router
	.route("/:host_id/disable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * POST /api/nginx/redirection-hosts/123/disable
	 */
	.post(
		asyncHandler(async (req, res) => {
			const result = await redirectionHostService.disable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		}),
	);

export default router;
