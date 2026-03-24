import express from "express";
import { deadHostService } from "../../modules/dead-host/index.js";
import { auth, validate } from "../../lib/express/middleware.js";
import { asyncHandler } from "../../lib/express/route-handler.js";
import validator from "../../lib/validator/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/nginx/dead-hosts
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /api/nginx/dead-hosts
	 *
	 * Retrieve all dead-hosts
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
			const rows = await deadHostService.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		}),
	)

	/**
	 * POST /api/nginx/dead-hosts
	 *
	 * Create a new dead-host
	 */
	.post(
		asyncHandler(async (req, res) => {
			const payload = await validate("/nginx/dead-hosts", "post")(req.body);
			const result = await deadHostService.create(res.locals.access, payload);
			res.status(201).send(result);
		}),
	);

/**
 * Specific dead-host
 *
 * /api/nginx/dead-hosts/123
 */
router
	.route("/:host_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /api/nginx/dead-hosts/123
	 *
	 * Retrieve a specific dead-host
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
			const row = await deadHostService.get(res.locals.access, {
				id: Number.parseInt(data.host_id, 10),
				expand: data.expand,
			});
			res.status(200).send(row);
		}),
	)

	/**
	 * PUT /api/nginx/dead-hosts/123
	 *
	 * Update an existing dead-host
	 */
	.put(
		asyncHandler(async (req, res) => {
			const payload = await validate("/nginx/dead-hosts/{hostID}", "put")(req.body);
			payload.id = Number.parseInt(req.params.host_id, 10);
			const result = await deadHostService.update(res.locals.access, payload);
			res.status(200).send(result);
		}),
	)

	/**
	 * DELETE /api/nginx/dead-hosts/123
	 *
	 * Delete a dead-host
	 */
	.delete(
		asyncHandler(async (req, res) => {
			const result = await deadHostService.delete(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		}),
	);

/**
 * Enable dead-host
 *
 * /api/nginx/dead-hosts/123/enable
 */
router
	.route("/:host_id/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * POST /api/nginx/dead-hosts/123/enable
	 */
	.post(
		asyncHandler(async (req, res) => {
			const result = await deadHostService.enable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		}),
	);

/**
 * Disable dead-host
 *
 * /api/nginx/dead-hosts/123/disable
 */
router
	.route("/:host_id/disable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * POST /api/nginx/dead-hosts/123/disable
	 */
	.post(
		asyncHandler(async (req, res) => {
			const result = await deadHostService.disable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		}),
	);

export default router;
