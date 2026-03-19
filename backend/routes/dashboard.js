import express from "express";
import internalDashboardNote from "../internal/dashboard_note.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/dashboard/notes
 */
router
	.route("/notes")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/dashboard/notes
	 *
	 * Retrieve all dashboard notes
	 */
	.get(async (_req, res, _next) => {
		const rows = await internalDashboardNote.getAll(res.locals.access);
		res.status(200).send(rows);
	})

	/**
	 * POST /api/dashboard/notes
	 *
	 * Create a new dashboard note
	 */
	.post(async (req, res, _next) => {
		const payload = await apiValidator(getValidationSchema("/dashboard/notes", "post"), req.body);
		const result = await internalDashboardNote.create(res.locals.access, payload);
		res.status(201).send(result);
	});

/**
 * /api/dashboard/notes/:id
 */
router
	.route("/notes/:id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * PUT /api/dashboard/notes/:id
	 *
	 * Update a note
	 */
	.put(async (req, res, _next) => {
		const payload = await apiValidator(getValidationSchema("/dashboard/notes/{noteID}", "put"), req.body);
		payload.id = req.params.id; // Ensure ID from path is used
		const result = await internalDashboardNote.update(res.locals.access, payload);
		res.status(200).send(result);
	})

	/**
	 * DELETE /api/dashboard/notes/:id
	 *
	 * Delete a note
	 */
	.delete(async (req, res, _next) => {
		const result = await internalDashboardNote.delete(res.locals.access, { id: req.params.id });
		res.status(200).send(result);
	});

export default router;
