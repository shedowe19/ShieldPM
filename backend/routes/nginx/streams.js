import express from "express";
import { streamService } from "../../modules/stream/index.js";
import { auth, validate } from "../../lib/express/middleware.js";
import { asyncHandler } from "../../lib/express/route-handler.js";
import validator from "../../lib/validator/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/nginx/streams
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth()) // preferred so it doesn't apply to nonexistent routes

	/**
	 * GET /api/nginx/streams
	 *
	 * Retrieve all streams
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
			const rows = await streamService.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		}),
	)

	/**
	 * POST /api/nginx/streams
	 *
	 * Create a new stream
	 */
	.post(
		asyncHandler(async (req, res) => {
			const payload = await validate("/nginx/streams", "post")(req.body);
			const result = await streamService.create(res.locals.access, payload);
			res.status(201).send(result);
		}),
	);

/**
 * Specific stream
 *
 * /api/nginx/streams/123
 */
router
	.route("/:stream_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth()) // preferred so it doesn't apply to nonexistent routes

	/**
	 * GET /api/nginx/streams/123
	 *
	 * Retrieve a specific stream
	 */
	.get(
		asyncHandler(async (req, res) => {
			const data = await validator(
				{
					required: ["stream_id"],
					additionalProperties: false,
					properties: {
						stream_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					stream_id: req.params.stream_id,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);
			const row = await streamService.get(res.locals.access, {
				id: Number.parseInt(data.stream_id, 10),
				expand: data.expand,
			});
			res.status(200).send(row);
		}),
	)

	/**
	 * PUT /api/nginx/streams/123
	 *
	 * Update and existing stream
	 */
	.put(
		asyncHandler(async (req, res) => {
			const payload = await validate("/nginx/streams/{streamID}", "put")(req.body);
			payload.id = Number.parseInt(req.params.stream_id, 10);
			const result = await streamService.update(res.locals.access, payload);
			res.status(200).send(result);
		}),
	)

	/**
	 * DELETE /api/nginx/streams/123
	 *
	 * Update and existing stream
	 */
	.delete(
		asyncHandler(async (req, res) => {
			const result = await streamService.delete(res.locals.access, {
				id: Number.parseInt(req.params.stream_id, 10),
			});
			res.status(200).send(result);
		}),
	);

/**
 * Enable stream
 *
 * /api/nginx/streams/123/enable
 */
router
	.route("/:host_id/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * POST /api/nginx/streams/123/enable
	 */
	.post(
		asyncHandler(async (req, res) => {
			const result = await streamService.enable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		}),
	);

/**
 * Disable stream
 *
 * /api/nginx/streams/123/disable
 */
router
	.route("/:host_id/disable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * POST /api/nginx/streams/123/disable
	 */
	.post(
		asyncHandler(async (req, res) => {
			const result = await streamService.disable(res.locals.access, {
				id: Number.parseInt(req.params.host_id, 10),
			});
			res.status(200).send(result);
		}),
	);

export default router;
