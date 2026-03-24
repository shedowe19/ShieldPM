import express from "express";
import internalDashboardNote from "../modules/dashboard-note/service.js";
import { auth, validate } from "../lib/express/middleware.js";
import { asyncHandler } from "../lib/express/route-handler.js";

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
	.all(auth())

	/**
	 * GET /api/dashboard/notes
	 *
	 * Retrieve all dashboard notes
	 */
	.get(
		asyncHandler(async (_req, res) => {
			const rows = await internalDashboardNote.getAll(res.locals.access);
			res.status(200).send(rows);
		}),
	)

	/**
	 * POST /api/dashboard/notes
	 *
	 * Create a new dashboard note
	 */
	.post(
		asyncHandler(async (req, res) => {
			const payload = await validate("/dashboard/notes", "post")(req.body);
			const result = await internalDashboardNote.create(res.locals.access, payload);
			res.status(201).send(result);
		}),
	);

/**
 * /api/dashboard/notes/:id
 */
router
	.route("/notes/:id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * PUT /api/dashboard/notes/:id
	 *
	 * Update a note
	 */
	.put(
		asyncHandler(async (req, res) => {
			const payload = await validate("/dashboard/notes/{noteID}", "put")(req.body);
			payload.id = req.params.id; // Ensure ID from path is used
			const result = await internalDashboardNote.update(res.locals.access, payload);
			res.status(200).send(result);
		}),
	)

	/**
	 * DELETE /api/dashboard/notes/:id
	 *
	 * Delete a note
	 */
	.delete(
		asyncHandler(async (req, res) => {
			const result = await internalDashboardNote.delete(res.locals.access, { id: req.params.id });
			res.status(200).send(result);
		}),
	);

export default router;
