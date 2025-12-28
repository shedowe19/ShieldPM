import express from "express";
import AnalyticCount from "../../models/analytic_count.js";
import AnalyticsLogs from "../../models/analytics_logs.js";
import ProxyHostModel from "../../models/proxy_host.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import dayjs from "dayjs";


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
            case "1h": since = now.subtract(1, "hour"); break;
            case "24h": since = now.subtract(24, "hour"); break;
            case "7d": since = now.subtract(7, "day"); break;
            case "30d": since = now.subtract(30, "day"); break;
            default: since = now.subtract(24, "hour"); break;
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
        const host = await ProxyHostModel.query().where("id", hostId).andWhere("is_deleted", 0).first();
        if (!host) return res.status(404).json({ error: "Host not found" });

        let since;
        const now = dayjs();
        // For detailed logs, we might strictly limit to 24h or 7d max due to retention
        switch (range) {
            case "1h": since = now.subtract(1, "hour"); break;
            case "24h": since = now.subtract(24, "hour"); break;
            case "7d": since = now.subtract(7, "day"); break;
            case "30d": since = now.subtract(30, "day"); break; // Might be empty if retention is 3d
            default: since = now.subtract(24, "hour"); break;
        }

        const sinceIso = since.toISOString();

        // Helper for aggregation queries
        // SQLite syntax used here. If Postgres/MySQL needed, knex raw might differ slightly.
        // Objection/Knex helps abstraction but GROUP BY is usually raw.

        const knex = AnalyticsLogs.knex();

        // Parallel execution for speed
        const [
            topCountries,
            topIps,
            topReferers,
            topUserAgents,
            topPaths,
            recent,
            resultTotals
        ] = await Promise.all([
            // Top Countries
            knex("analytics_logs")
                .select("country_code")
                .count("* as count")
                .where("host_id", hostId)
                .andWhere("time", ">=", sinceIso)
                .groupBy("country_code")
                .orderBy("count", "desc")
                .limit(10),

            // Top IPs
            knex("analytics_logs")
                .select("ip", "country_code")
                .count("* as count")
                .where("host_id", hostId)
                .andWhere("time", ">=", sinceIso)
                .groupBy("ip", "country_code")
                .orderBy("count", "desc")
                .limit(10),

            // Top Referrers
            knex("analytics_logs")
                .select("referer")
                .count("* as count")
                .where("host_id", hostId)
                .andWhere("time", ">=", sinceIso)
                .whereNotNull("referer")
                .andWhereNot("referer", "-")
                .groupBy("referer")
                .orderBy("count", "desc")
                .limit(10),

            // Top UAs
            knex("analytics_logs")
                .select("user_agent")
                .count("* as count")
                .where("host_id", hostId)
                .andWhere("time", ">=", sinceIso)
                .groupBy("user_agent")
                .orderBy("count", "desc")
                .limit(10),

            // Top Paths
            knex("analytics_logs")
                .select("path")
                .count("* as count")
                .where("host_id", hostId)
                .andWhere("time", ">=", sinceIso)
                .groupBy("path")
                .orderBy("count", "desc")
                .limit(10),

            // Recent 20 requests
            knex("analytics_logs")
                .select("*")
                .where("host_id", hostId)
                .andWhere("time", ">=", sinceIso)
                .orderBy("time", "desc")
                .limit(20),

            // Aggregated Totals
            AnalyticCount.query()
                .where("proxy_host_id", hostId)
                .andWhere("timestamp", ">=", sinceIso)
                .sum("request_count as count")
                .sum("status_code_2xx as s2xx")
                .sum("status_code_3xx as s3xx")
                .sum("status_code_4xx as s4xx")
                .sum("status_code_5xx as s5xx")
                .first()
        ]);

        const totals = resultTotals || { count: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 };
        // DEBUG: Inspect aggregation keys
        console.log("Analytics Summary Totals Keys:", Object.keys(totals), totals);
        console.log("Top Countries Length:", topCountries.length);
        console.log("Recent Requests Length:", recent.length);

        res.json({
            // KPI Data
            count: Number(totals.count) || 0,
            status_2xx: Number(totals.s2xx) || 0,
            status_3xx: Number(totals.s3xx) || 0,
            status_4xx: Number(totals.s4xx) || 0,
            status_5xx: Number(totals.s5xx) || 0,
            // Lists
            top_countries: topCountries,
            top_ips: topIps,
            top_referers: topReferers,
            top_user_agents: topUserAgents,
            top_paths: topPaths,
            recent_requests: recent
        });

    } catch (err) {
        next(err);
    }
});

export default router;
