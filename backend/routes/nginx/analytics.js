import dayjs from "dayjs";
import express from "express";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import AnalyticCount from "../../models/analytic_count.js";
import { analyticsService } from "../../modules/analytics/index.js";

const router = express.Router({
	mergeParams: true,
});

/**
 * GET /api/nginx/analytics/:hostId
 * Query Params: range (1h, 24h, 7d, 30d) - default 24h
 * Returns time-series data for charts
 */
router.get("/:hostId", jwtdecode(), async (req, res, next) => {
	try {
		const hostId = Number.parseInt(req.params.hostId, 10);
		const range = req.query.range || "24h";

		await analyticsService.assertHostAccess(res.locals.access, hostId);

		let since;
		const now = dayjs();

		switch (range) {
			case "1h":
				since = now.subtract(1, "hour");
				break;
			case "24h":
				since = now.subtract(24, "hour");
				break;
			case "7d":
				since = now.subtract(7, "day");
				break;
			case "30d":
				since = now.subtract(30, "day");
				break;
			default:
				since = now.subtract(24, "hour");
				break;
		}

		const data = await AnalyticCount.query()
			.where("proxy_host_id", hostId)
			.andWhere("timestamp", ">=", since.toISOString())
			.orderBy("timestamp", "asc");

		res.json(data);
	} catch (err) {
		if (err instanceof errs.PermissionError) {
			return res.status(403).json({ error: "Forbidden" });
		}
		if (err instanceof errs.ItemNotFoundError) {
			return res.status(404).json({ error: "Host not found" });
		}
		next(err);
	}
});

/**
 * GET /api/nginx/analytics/:hostId/summary
 * Query Params: range (1h, 24h, 7d, 30d) - default 24h
 * Returns aggregated Top N lists and Geo map data
 */
router.get("/:hostId/summary", jwtdecode(), async (req, res, next) => {
	try {
		const hostId = Number.parseInt(req.params.hostId, 10);
		const range = req.query.range || "24h";

		const summary = await analyticsService.getHostSummary(res.locals.access, hostId, range);

		res.json({
			...summary.stats,
			top_countries: summary.top_countries,
			top_ips: summary.top_ips,
			top_referers: summary.top_referers,
			top_user_agents: summary.top_user_agents,
			top_paths: summary.top_paths,
			recent_requests: summary.recent_requests,
		});
	} catch (err) {
		if (err instanceof errs.PermissionError) {
			return res.status(403).json({ error: "Forbidden" });
		}
		if (err instanceof errs.ItemNotFoundError) {
			return res.status(404).json({ error: "Host not found" });
		}
		next(err);
	}
});

export default router;
