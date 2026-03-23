import express from "express";
import internalReport from "../modules/report/service.js";
import { auth } from "../lib/express/middleware.js";
import { asyncHandler } from "../lib/express/route-handler.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/hosts")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(auth())

	/**
	 * GET /reports/hosts
	 */
	.get(
		asyncHandler(async (_req, res) => {
			const data = await internalReport.getHostsReport(res.locals.access);
			res.status(200).send(data);
		}),
	);

export default router;
