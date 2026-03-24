import express from "express";
import { auditLogService } from "../modules/audit-log/index.js";
import { auth } from "../lib/express/middleware.js";
import { asyncHandler } from "../lib/express/route-handler.js";
import validator from "../lib/validator/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/audit-log
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /api/audit-log
	 *
	 * Retrieve all logs
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
			const rows = await auditLogService.getAll(res.locals.access, data.expand, data.query);
			res.status(200).send(rows);
		}),
	);

/**
 * Specific audit log entry
 *
 * /api/audit-log/123
 */
router
	.route("/:event_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /api/audit-log/123
	 *
	 * Retrieve a specific entry
	 */
	.get(
		asyncHandler(async (req, res) => {
			const data = await validator(
				{
					required: ["event_id"],
					additionalProperties: false,
					properties: {
						event_id: {
							$ref: "common#/properties/id",
						},
						expand: {
							$ref: "common#/properties/expand",
						},
					},
				},
				{
					event_id: req.params.event_id,
					expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				},
			);

			const item = await auditLogService.get(res.locals.access, {
				id: data.event_id,
				expand: data.expand,
			});
			res.status(200).send(item);
		}),
	);

export default router;
