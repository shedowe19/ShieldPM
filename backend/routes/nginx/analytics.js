import dayjs from "dayjs";
import express from "express";
import internalAnalytics from "../../internal/analytics.js";
import { resolveAnalyticsRange } from "../../lib/analytics-range.js";
import { serializeAnalyticsSeries, serializeAnalyticsSummary } from "../../lib/analytics-response.js";
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
		const { resolution, since } = resolveAnalyticsRange(req.query.range, dayjs());

		await internalAnalytics.assertHostAccess(res.locals.access, hostId);

		const data = await AnalyticCount.query()
			.where("proxy_host_id", hostId)
			.andWhere("timestamp", ">=", since.toISOString())
			.orderBy("timestamp", "asc");

		res.json(serializeAnalyticsSeries(data, resolution));
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
		const { range } = resolveAnalyticsRange(req.query.range, dayjs());

		const summary = await internalAnalytics.getHostSummary(res.locals.access, hostId, range);

		res.json(serializeAnalyticsSummary(summary));
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
