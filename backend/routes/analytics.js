import dayjs from "dayjs";
import express from "express";
import analyticsService from "../internal/analytics.js";
import analyticsRollup from "../internal/analytics-rollup.js";
import {
	loadAnalyticsSeries,
	planAnalyticsRange,
	resolveSeriesResolution,
	sumAnalyticsRange,
	sumAnalyticsRangeByHost,
} from "../lib/analytics-query.js";
import { serializeAnalyticsSeries } from "../lib/analytics-response.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import AnalyticCount from "../models/analytic_count.js";
import AnalyticsLogs from "../models/analytics_logs.js";
import ProxyHost from "../models/proxy_host.js";

const router = express.Router();

// Apply auth to all analytics endpoints
router.use(jwtdecode());

// Enforce global analytics access for platform-wide analytics.
// The permission is cached on the response so every handler can derive the ownership scope
// without trusting `permission_analytics: "view"` as access to other users' hosts.
router.use(async (_req, res, next) => {
	res.locals.analyticsPermission = await res.locals.access.can("analytics:list");
	next();
});

const resolveRequestScope = async (res) => {
	const access = res?.locals?.access;
	if (!access) return { allHosts: false, userId: 0 };
	const permission = res.locals.analyticsPermission ?? (await access.can("analytics:list"));
	return {
		allHosts: Boolean(permission?.roles?.includes("admin") || permission?.permission_visibility === "all"),
		userId: access?.token?.getUserId?.(0) || 0,
	};
};

const visibleHostsQuery = (scope) =>
	ProxyHost.query().where("is_deleted", 0).andWhere("owner_user_id", scope.userId).select("id");

const applyHostScope = (query, scope, column) => {
	if (scope.allHosts) return query;
	return query.whereIn(column, visibleHostsQuery(scope));
};

const sumExpression = (query) =>
	query
		.sum("request_count as count")
		.sum("bytes_sent as bytes")
		.sum("status_code_2xx as s2xx")
		.sum("status_code_3xx as s3xx")
		.sum("status_code_4xx as s4xx")
		.sum("status_code_5xx as s5xx")
		.first();

const parseStats = (stats) => {
	const safeStats = {
		bytes: 0,
		count: 0,
		s2xx: 0,
		s3xx: 0,
		s4xx: 0,
		s5xx: 0,
		...stats,
	};
	return {
		bytes: Number.parseInt(safeStats.bytes || 0, 10),
		count: Number.parseInt(safeStats.count || 0, 10),
		status_2xx: Number.parseInt(safeStats.s2xx || 0, 10),
		status_3xx: Number.parseInt(safeStats.s3xx || 0, 10),
		status_4xx: Number.parseInt(safeStats.s4xx || 0, 10),
		status_5xx: Number.parseInt(safeStats.s5xx || 0, 10),
	};
};

/**
 * GET /api/analytics/summary
 * Returns aggregated totals for a given time range.
 */
router.get("/summary", async (req, res) => {
	try {
		// Default to last 24h
		const start = req.query.start || dayjs().subtract(24, "hour").toISOString();
		const end = req.query.end || dayjs().toISOString();
		const scope = await resolveRequestScope(res);
		const plan = planAnalyticsRange({
			coveredFrom: analyticsRollup.getQueryCoveredFrom(),
			coveredThrough: analyticsRollup.getQueryCoveredThrough(),
			end,
			start,
		});
		let stats = {};
		let unattributed = null;

		if (plan.hourly) {
			const filters = {
				applyScope: (query) => applyHostScope(query, scope, "proxy_host_id"),
				excludeUnattributed: scope.allHosts,
			};
			stats = await sumAnalyticsRange(AnalyticCount.knex(), plan, filters);
			if (scope.allHosts) {
				unattributed = parseStats(
					await sumAnalyticsRange(AnalyticCount.knex(), plan, { onlyUnattributed: true }),
				);
			}
		} else {
			const query = AnalyticCount.knex()
				.from("analytic_count")
				.where("timestamp", ">=", start)
				.andWhere("timestamp", "<=", end);
			applyHostScope(query, scope, "proxy_host_id");
			// Host 0 is the global/unattributed bucket. It is reported separately and never mixed into
			// the sum of real hosts, for administrators and normal users alike.
			if (scope.allHosts) query.whereNotNull("proxy_host_id");
			stats = (await sumExpression(query)) || {};

			if (scope.allHosts) {
				const unattributedQuery = AnalyticCount.knex()
					.from("analytic_count")
					.whereNull("proxy_host_id")
					.where("timestamp", ">=", start)
					.andWhere("timestamp", "<=", end);
				unattributed = parseStats((await sumExpression(unattributedQuery)) || {});
			}
		}

		res.json({
			...parseStats(stats),
			kpi_window: {
				range: null,
				rollup: Boolean(plan.hourly),
				since: start,
				source: "aggregates",
				until: end,
			},
			unattributed,
		});
	} catch (err) {
		res.status(500).json({
			error: err.message,
		});
	}
});

/**
 * GET /api/analytics/series
 * Returns time-series data for graphing.
 */
router.get("/series", async (req, res) => {
	try {
		const start = req.query.start || dayjs().subtract(24, "hour").toISOString();
		const end = req.query.end || dayjs().toISOString();
		const scope = await resolveRequestScope(res);
		const plan = planAnalyticsRange({
			coveredFrom: analyticsRollup.getQueryCoveredFrom(),
			coveredThrough: analyticsRollup.getQueryCoveredThrough(),
			end,
			start,
		});

		if (plan.hourly) {
			const rows = await loadAnalyticsSeries(AnalyticCount.knex(), plan, {
				applyScope: (query) => applyHostScope(query, scope, "proxy_host_id"),
				excludeUnattributed: scope.allHosts,
			});
			return res.json(serializeAnalyticsSeries(rows, resolveSeriesResolution(start, end)));
		}

		// Fetch raw bucketed data
		// For performance on large sets, we might want to aggregate by hour if range > 24h
		const query = AnalyticCount.query().where("timestamp", ">=", start).andWhere("timestamp", "<=", end);
		applyHostScope(query, scope, "proxy_host_id");
		if (scope.allHosts) query.whereNotNull("proxy_host_id");
		const data = await query.orderBy("timestamp", "asc");

		// We might want to aggregate further per timestamp if multiple hosts exist
		// But for now, we just pass the raw rows or aggregate in JS

		// Group by timestamp
		const grouped = {};
		for (const row of data) {
			if (!grouped[row.timestamp]) {
				grouped[row.timestamp] = {
					timestamp: row.timestamp,
					count: 0,
					bytes: 0,
					s2xx: 0,
					s3xx: 0,
					s4xx: 0,
					s5xx: 0,
				};
			}
			const g = grouped[row.timestamp];
			g.count += row.request_count;
			g.bytes += Number.parseInt(row.bytes_sent, 10); // sqlite might return string for bigint
			g.s2xx += row.status_code_2xx;
			g.s3xx += row.status_code_3xx;
			g.s4xx += row.status_code_4xx;
			g.s5xx += row.status_code_5xx;
		}
		res.json(Object.values(grouped));
	} catch (err) {
		res.status(500).json({
			error: err.message,
		});
	}
});

/**
 * GET /api/analytics/top-hosts
 * Returns top hosts by request count, transferred bytes, errors, or average response time
 */
router.get("/top-hosts", async (req, res) => {
	try {
		const start = req.query.start || dayjs().subtract(24, "hour").toISOString();
		const end = req.query.end || dayjs().toISOString();
		const scope = await resolveRequestScope(res);
		const detailStart = dayjs()
			.subtract(analyticsService.detailRetentionHours ?? 24, "hour")
			.toISOString();
		const responseTimeStart = dayjs(start).isBefore(dayjs(detailStart)) ? detailStart : start;
		// Long aggregate ranges must not silently rank response times from a shorter detail window.
		res.set("X-Analytics-Kpi-Since", start);
		res.set("X-Analytics-Detail-Since", responseTimeStart);

		const sort = ["bytes", "client_errors", "response_time", "server_errors"].includes(req.query.sort)
			? req.query.sort
			: "requests";
		const plan = planAnalyticsRange({
			coveredFrom: analyticsRollup.getQueryCoveredFrom(),
			coveredThrough: analyticsRollup.getQueryCoveredThrough(),
			end,
			start,
		});
		const activeHosts = () => {
			const query = ProxyHost.query()
				.alias("proxy_host")
				.join("host_domain", "host_domain.proxy_host_id", "proxy_host.id")
				.select("proxy_host.id")
				.where("proxy_host.is_deleted", 0)
				.groupBy("proxy_host.id");
			applyHostScope(query, scope, "proxy_host.id");
			return query;
		};
		const hostsWithDomains = activeHosts();
		let rankings;
		if (sort === "response_time") {
			rankings = await AnalyticsLogs.query()
				.alias("analytics_logs")
				.whereIn("analytics_logs.host_id", hostsWithDomains)
				.where("analytics_logs.time", ">=", responseTimeStart)
				.andWhere("analytics_logs.time", "<=", end)
				.where("analytics_logs.duration", ">", 0)
				.select("analytics_logs.host_id as id")
				.avg("analytics_logs.duration as average_duration")
				.groupBy("analytics_logs.host_id")
				.orderBy("average_duration", "desc")
				.limit(5);
		} else if (plan.hourly) {
			const grouped = await sumAnalyticsRangeByHost(AnalyticCount.knex(), plan, {
				applyScope: (query) => query.whereIn("proxy_host_id", activeHosts()),
				excludeUnattributed: true,
			});
			rankings = grouped
				.sort((left, right) => (right[sort] || 0) - (left[sort] || 0) || left.id - right.id)
				.slice(0, 5);
		} else {
			rankings = await AnalyticCount.query()
				.alias("analytic_count")
				.whereNotNull("analytic_count.proxy_host_id")
				.whereIn("analytic_count.proxy_host_id", hostsWithDomains)
				.where("analytic_count.timestamp", ">=", start)
				.andWhere("analytic_count.timestamp", "<=", end)
				.select("analytic_count.proxy_host_id as id")
				.sum("analytic_count.request_count as requests")
				.sum("analytic_count.bytes_sent as bytes")
				.sum("analytic_count.status_code_4xx as client_errors")
				.sum("analytic_count.status_code_5xx as server_errors")
				.groupBy("analytic_count.proxy_host_id")
				.orderBy(sort, "desc")
				.limit(5);
		}

		const hostIds = rankings.map((ranking) => Number(ranking.id));
		if (hostIds.length === 0) {
			return res.json([]);
		}
		let metrics;
		if (sort === "response_time") {
			metrics = plan.hourly
				? await sumAnalyticsRangeByHost(AnalyticCount.knex(), plan, {
						applyScope: (query) => query.whereIn("proxy_host_id", activeHosts()),
						excludeUnattributed: true,
						hostIds,
					})
				: await AnalyticCount.query()
						.alias("analytic_count")
						.whereIn("analytic_count.proxy_host_id", hostIds)
						.where("analytic_count.timestamp", ">=", start)
						.andWhere("analytic_count.timestamp", "<=", end)
						.select("analytic_count.proxy_host_id as id")
						.sum("analytic_count.request_count as requests")
						.sum("analytic_count.bytes_sent as bytes")
						.sum("analytic_count.status_code_4xx as client_errors")
						.sum("analytic_count.status_code_5xx as server_errors")
						.groupBy("analytic_count.proxy_host_id");
		} else {
			metrics = rankings;
		}
		const metricsByHostId = new Map(metrics.map((metric) => [Number(metric.id), metric]));

		const hostsQuery = ProxyHost.query().whereIn("id", hostIds).where("is_deleted", 0);
		if (!scope.allHosts) hostsQuery.andWhere("owner_user_id", scope.userId);
		const hosts = await hostsQuery.withGraphFetched("host_domains");
		const domainsByHostId = new Map(hosts.map((host) => [host.id, host.domain_names[0]]));

		res.json(
			rankings.flatMap((ranking) => {
				const id = Number(ranking.id);
				const domainName = domainsByHostId.get(id);
				const metric = metricsByHostId.get(id) || {};
				return domainName
					? [
							{
								...(sort === "response_time"
									? { average_duration: Number(ranking.average_duration) || 0 }
									: {}),
								bytes: Number(metric.bytes) || 0,
								domain_name: domainName,
								id,
								requests: Number(metric.requests) || 0,
								client_errors: Number(metric.client_errors) || 0,
								server_errors: Number(metric.server_errors) || 0,
							},
						]
					: [];
			}),
		);
	} catch (err) {
		res.status(500).json({
			error: err.message,
		});
	}
});

/**
 * GET /api/analytics/status
 * Returns real-time system status (Network Bandwidth)
 */
import si from "systeminformation";

router.get("/status", async (_req, res) => {
	try {
		const net = await si.networkStats();
		// Sum up all interfaces or specifically 'eth0' if known?
		// Usually, the first non-internal interface is good.
		// sum rx_sec and tx_sec (received/transferred bytes per second)
		const rx = net.reduce((acc, iface) => acc + (iface.rx_sec || 0), 0);
		const tx = net.reduce((acc, iface) => acc + (iface.tx_sec || 0), 0);
		res.json({
			ingestion: analyticsService.getStatus(),
			rx_sec: rx,
			tx_sec: tx,
			total_sec: rx + tx,
		});
	} catch (err) {
		res.status(500).json({
			error: err.message,
		});
	}
});

import { isMysql, isPostgres, isSqlite } from "../lib/config.js";

/**
 * GET /api/analytics/db-stats
 * Returns database statistics (size, connections, engine type)
 */
router.get("/db-stats", async (_req, res) => {
	try {
		const knex = AnalyticCount.knex();
		const stats = {
			engine: "unknown",
			size: 0,
			connections: {
				open: 0,
				used: 0,
				max: 0,
			},
			io: {
				reads: 0,
				writes: 0,
			},
		};
		if (isSqlite()) {
			stats.engine = "sqlite";
			// Get database file size via PRAGMA
			const pageCount = await knex.raw("PRAGMA page_count");
			const pageSize = await knex.raw("PRAGMA page_size");
			stats.size = pageCount[0].page_count * pageSize[0].page_size;
			// SQLite with better-sqlite3 uses synchronous single connection
			stats.connections = {
				open: 1,
				used: 1,
				max: 1,
			};
			// SQLite doesn't expose cumulative read/write stats easily,
			// but we can get cache hit ratio from PRAGMA

			const cacheStats = await knex.raw("PRAGMA cache_stats");
			if (cacheStats?.[0]) {
				stats.io.reads = cacheStats[0].read || 0;
				stats.io.writes = cacheStats[0].write || 0;
			}
		} else if (isMysql()) {
			stats.engine = "mysql";
			// MySQL database size
			const [sizeResult] = await knex.raw(`
				SELECT SUM(data_length + index_length) as size
				FROM information_schema.tables
				WHERE table_schema = DATABASE()
			`);
			stats.size = Number.parseInt(sizeResult[0]?.size || 0, 10);
			// MySQL connections
			const [connResult] = await knex.raw("SHOW STATUS LIKE 'Threads_connected'");
			stats.connections.open = Number.parseInt(connResult[0]?.Value || 0, 10);
			// MySQL I/O stats (Handler-based, works with all storage engines)
			const [readResult] = await knex.raw("SHOW GLOBAL STATUS LIKE 'Handler_read_rnd_next'");
			const [writeResult] = await knex.raw("SHOW GLOBAL STATUS LIKE 'Handler_write'");
			stats.io.reads = Number.parseInt(readResult[0]?.Value || 0, 10);
			stats.io.writes = Number.parseInt(writeResult[0]?.Value || 0, 10);
		} else if (isPostgres()) {
			stats.engine = "postgresql";
			// PostgreSQL database size
			const sizeResult = await knex.raw("SELECT pg_database_size(current_database()) as size");
			stats.size = Number.parseInt(sizeResult.rows[0]?.size || 0, 10);
			// PostgreSQL connections
			const connResult = await knex.raw(`
				SELECT count(*) as open FROM pg_stat_activity
				WHERE datname = current_database()
			`);
			stats.connections.open = Number.parseInt(connResult.rows[0]?.open || 0, 10);
			// PostgreSQL I/O stats from pg_stat_database
			const ioResult = await knex.raw(`
				SELECT blks_read, blks_hit, tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted
				FROM pg_stat_database
				WHERE datname = current_database()
			`);
			if (ioResult.rows[0]) {
				// Reads = blocks read from disk + blocks from cache (hit)
				stats.io.reads =
					Number.parseInt(ioResult.rows[0].blks_read || 0, 10) +
					Number.parseInt(ioResult.rows[0].blks_hit || 0, 10);
				// Writes = inserts + updates + deletes
				stats.io.writes =
					Number.parseInt(ioResult.rows[0].tup_inserted || 0, 10) +
					Number.parseInt(ioResult.rows[0].tup_updated || 0, 10) +
					Number.parseInt(ioResult.rows[0].tup_deleted || 0, 10);
			}
		}
		res.json(stats);
	} catch (err) {
		res.status(500).json({
			error: err.message,
		});
	}
});
export default router;
