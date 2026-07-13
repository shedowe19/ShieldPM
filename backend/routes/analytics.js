import dayjs from "dayjs";
import express from "express";
import jwtdecode from "../lib/express/jwt-decode.js";
import AnalyticCount from "../models/analytic_count.js";
import ProxyHost from "../models/proxy_host.js";

const router = express.Router();

// Apply auth to all analytics endpoints
router.use(jwtdecode());

// Enforce global admin access for platform-wide analytics
router.use(async (_req, res, next) => {
	await res.locals.access.can("analytics:list");
	next();
});

/**
 * GET /api/analytics/summary
 * Returns aggregated totals for a given time range.
 */
router.get("/summary", async (req, res) => {
	try {
		// Default to last 24h
		const start = req.query.start || dayjs().subtract(24, "hour").toISOString();
		const end = req.query.end || dayjs().toISOString();
		const stats =
			(await AnalyticCount.knex()
				.from("analytic_count")
				.where("timestamp", ">=", start)
				.andWhere("timestamp", "<=", end)
				.sum("request_count as count")
				.sum("bytes_sent as bytes")
				.sum("status_code_2xx as s2xx")
				.sum("status_code_3xx as s3xx")
				.sum("status_code_4xx as s4xx")
				.sum("status_code_5xx as s5xx")
				.first()) || {};
		const defaults = {
			count: 0,
			bytes: 0,
			s2xx: 0,
			s3xx: 0,
			s4xx: 0,
			s5xx: 0,
		};
		const safeStats = {
			...defaults,
			...stats,
		};
		res.json({
			count: Number.parseInt(safeStats.count || 0, 10),
			bytes: Number.parseInt(safeStats.bytes || 0, 10),
			status_2xx: Number.parseInt(safeStats.s2xx || 0, 10),
			status_3xx: Number.parseInt(safeStats.s3xx || 0, 10),
			status_4xx: Number.parseInt(safeStats.s4xx || 0, 10),
			status_5xx: Number.parseInt(safeStats.s5xx || 0, 10),
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

		// Fetch raw bucketed data
		// For performance on large sets, we might want to aggregate by hour if range > 24h
		const data = await AnalyticCount.query()
			.where("timestamp", ">=", start)
			.andWhere("timestamp", "<=", end)
			.orderBy("timestamp", "asc");

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
 * Returns top hosts by request count or server errors
 */
router.get("/top-hosts", async (req, res) => {
	try {
		const start = req.query.start || dayjs().subtract(24, "hour").toISOString();
		const end = req.query.end || dayjs().toISOString();
		const sort = req.query.sort === "server_errors" ? "server_errors" : "requests";
		const hostsWithDomains = ProxyHost.query()
			.alias("proxy_host")
			.join("host_domain", "host_domain.proxy_host_id", "proxy_host.id")
			.select("proxy_host.id")
			.where("proxy_host.is_deleted", 0)
			.groupBy("proxy_host.id");
		const counts = await AnalyticCount.query()
			.alias("analytic_count")
			.whereNotNull("analytic_count.proxy_host_id")
			.whereIn("analytic_count.proxy_host_id", hostsWithDomains)
			.where("analytic_count.timestamp", ">=", start)
			.andWhere("analytic_count.timestamp", "<=", end)
			.select("analytic_count.proxy_host_id as id")
			.sum("analytic_count.request_count as requests")
			.sum("analytic_count.status_code_5xx as server_errors")
			.groupBy("analytic_count.proxy_host_id")
			.orderBy(sort, "desc")
			.limit(5);

		const hostIds = counts.map((count) => Number(count.id));
		if (hostIds.length === 0) {
			return res.json([]);
		}

		const hosts = await ProxyHost.query()
			.whereIn("id", hostIds)
			.where("is_deleted", 0)
			.withGraphFetched("host_domains");
		const domainsByHostId = new Map(hosts.map((host) => [host.id, host.domain_names[0]]));

		res.json(
			counts.flatMap((count) => {
				const id = Number(count.id);
				const domainName = domainsByHostId.get(id);
				return domainName
					? [
							{
								domain_name: domainName,
								id,
								requests: Number(count.requests),
								server_errors: Number(count.server_errors),
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
