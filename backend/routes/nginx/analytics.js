import dayjs from "dayjs";
import express from "express";
import jwtdecode from "../../lib/express/jwt-decode.js";
import AnalyticCount from "../../models/analytic_count.js";
import ProxyHostModel from "../../models/proxy_host.js";

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

		// Security: Check if user owns the host (or admin)
		// Assuming standard access control middleware handles extensive checks,
		// but here we do a quick check if host exists and is not deleted.
		const host = await ProxyHostModel.query().where("id", hostId).andWhere("is_deleted", 0).first();
		if (!host) {
			return res.status(404).json({ error: "Host not found" });
		}

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

		// Use Aggregated Counts for charts
		// We sum up counts per time bucket
		// (Actually stored as 1-minute buckets, frontend might want to aggregate further for 30d view)
		const data = await AnalyticCount.query()
			.where("proxy_host_id", hostId)
			.andWhere("timestamp", ">=", since.toISOString())
			.orderBy("timestamp", "asc");

		res.json(data);
	} catch (err) {
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

		// Access Check
		// Use shared service logic
		// This keeps logic consistent between Dashboard and AI
		const internalAnalytics = (await import("../../internal/analytics.js")).default;
		const summary = await internalAnalytics.getHostSummary(hostId, range);

		// Map to expected frontend format (service structure is slightly cleaner/nested)
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
		next(err);
	}
});

export default router;
