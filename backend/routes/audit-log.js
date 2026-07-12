import express from "express";
import internalAuditLog from "../internal/audit-log.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";

const utcDateTimeSchema = {
	anyOf: [
		{
			type: "null",
		},
		{
			pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
			type: "string",
		},
	],
};

const validateUtcDateTime = (value, field) => {
	if (value === null || value === "") {
		return null;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
		throw new errs.ValidationError(`${field} must be a valid UTC timestamp`);
	}

	return value;
};

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
	.all(jwtdecode())

	/**
	 * GET /api/audit-log
	 *
	 * Retrieve all logs
	 */
	.get(async (req, res, _next) => {
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
					action: {
						$ref: "common#/properties/query",
					},
					created_after: utcDateTimeSchema,
					created_before: utcDateTimeSchema,
				},
			},
			{
				expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				action: typeof req.query.action === "string" ? req.query.action : null,
				query: typeof req.query.query === "string" ? req.query.query : null,
				created_after: typeof req.query.created_after === "string" ? req.query.created_after : null,
				created_before: typeof req.query.created_before === "string" ? req.query.created_before : null,
			},
		);
		const createdAfter = validateUtcDateTime(data.created_after, "created_after");
		const createdBefore = validateUtcDateTime(data.created_before, "created_before");

		if (createdAfter && createdBefore && createdBefore < createdAfter) {
			throw new errs.ValidationError("created_before must not be earlier than created_after");
		}

		const rows = await internalAuditLog.getAll(res.locals.access, data.expand, data.query, {
			...(data.action ? { action: data.action } : {}),
			created_after: createdAfter,
			created_before: createdBefore,
		});
		res.status(200).send(rows);
	});

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
	.all(jwtdecode())

	/**
	 * GET /api/audit-log/123
	 *
	 * Retrieve a specific entry
	 */
	.get(async (req, res, _next) => {
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

		const item = await internalAuditLog.get(res.locals.access, {
			id: data.event_id,
			expand: data.expand,
		});
		res.status(200).send(item);
	});

export default router;
