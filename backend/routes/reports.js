import express from "express";
import internalReport from "../modules/report/service.js";
import jwtdecode from "../lib/express/jwt-decode.js";

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
	.all(jwtdecode())

	/**
	 * GET /reports/hosts
	 */
	.get(async (_req, res) => {
		const data = await internalReport.getHostsReport(res.locals.access);
		res.status(200).send(data);
	});

export default router;
