import express from "express";
import internalAnalytics, { parseAnalyticsRange } from "../../internal/analytics.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import AnalyticCount from "../../models/analytic_count.js";

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
		const window = parseAnalyticsRange(req.query.range);

		await internalAnalytics.assertHostAccess(res.locals.access, hostId);

		const data = await AnalyticCount.query()
			.where("proxy_host_id", hostId)
			.andWhere("timestamp", ">=", window.start)
			.andWhere("timestamp", "<=", window.end)
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
		const summary = await internalAnalytics.getHostSummary(res.locals.access, hostId, req.query.range);

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
