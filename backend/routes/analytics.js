import dayjs from "dayjs";
import express from "express";
import si from "systeminformation";
import { isMysql, isPostgres, isSqlite } from "../lib/config.js";
import { auth } from "../lib/express/middleware.js";
import { asyncHandler } from "../lib/express/route-handler.js";
import { analyticsService } from "../modules/analytics/index.js";
const router = express.Router();

const responseCache = new Map();

const withCachedJson = async (key, ttlMs, producer) => {
	const cached = responseCache.get(key);
	const now = Date.now();
	if (cached && cached.expiresAt > now) {
		return cached.value;
	}

	const value = await producer();
	responseCache.set(key, {
		value,
		expiresAt: now + ttlMs,
	});
	return value;
};

// Apply auth to all analytics endpoints
router.use(auth());

// Enforce global admin access for platform-wide analytics
router.use(async (_req, res, next) => {
	await res.locals.access.can("analytics:list");
	next();
});

/**
 * GET /api/analytics/summary
 * Returns aggregated totals for a given time range.
 */
router.get(
	"/summary",
	asyncHandler(async (req, res) => {
		// Default to last 24h
		const start = req.query.start || dayjs().subtract(24, "hour").toISOString();
		const end = req.query.end || dayjs().toISOString();
		const stats = await analyticsService.getSummaryByRange(start, end);
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
	}),
);

/**
 * GET /api/analytics/series
 * Returns time-series data for graphing.
 */
router.get(
	"/series",
	asyncHandler(async (req, res) => {
		const start = req.query.start || dayjs().subtract(24, "hour").toISOString();
		const end = req.query.end || dayjs().toISOString();

		const data = await analyticsService.getSeriesByRange(start, end);

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
			g.bytes += Number.parseInt(row.bytes_sent, 10);
			g.s2xx += row.status_code_2xx;
			g.s3xx += row.status_code_3xx;
			g.s4xx += row.status_code_4xx;
			g.s5xx += row.status_code_5xx;
		}
		res.json(Object.values(grouped));
	}),
);

/**
 * GET /api/analytics/top-hosts
 * Returns top hosts by request count
 */
router.get(
	"/top-hosts",
	asyncHandler(async (_req, res) => {
		res.json([]);
	}),
);

/**
 * GET /api/analytics/status
 * Returns real-time system status (Network Bandwidth)
 */
router.get(
	"/status",
	asyncHandler(async (_req, res) => {
		const payload = await withCachedJson("analytics-status", 5000, async () => {
			const net = await si.networkStats();
			const rx = net.reduce((acc, iface) => acc + (iface.rx_sec || 0), 0);
			const tx = net.reduce((acc, iface) => acc + (iface.tx_sec || 0), 0);
			return {
				rx_sec: rx,
				tx_sec: tx,
				total_sec: rx + tx,
			};
		});
		res.json(payload);
	}),
);

/**
 * GET /api/analytics/db-stats
 * Returns database statistics (size, connections, engine type)
 */
router.get(
	"/db-stats",
	asyncHandler(async (_req, res) => {
		const payload = await withCachedJson("analytics-db-stats", 15000, async () => {
			const knex = analyticsService.getKnex();
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
				const pageCount = await knex.raw("PRAGMA page_count");
				const pageSize = await knex.raw("PRAGMA page_size");
				stats.size = pageCount[0].page_count * pageSize[0].page_size;
				stats.connections = {
					open: 1,
					used: 1,
					max: 1,
				};

				const cacheStats = await knex.raw("PRAGMA cache_stats");
				if (cacheStats?.[0]) {
					stats.io.reads = cacheStats[0].read || 0;
					stats.io.writes = cacheStats[0].write || 0;
				}
			} else if (isMysql()) {
				stats.engine = "mysql";
				const [sizeResult] = await knex.raw(`
					SELECT SUM(data_length + index_length) as size
					FROM information_schema.tables
					WHERE table_schema = DATABASE()
				`);
				stats.size = Number.parseInt(sizeResult[0]?.size || 0, 10);
				const [connResult] = await knex.raw("SHOW STATUS LIKE 'Threads_connected'");
				stats.connections.open = Number.parseInt(connResult[0]?.Value || 0, 10);
				const [readResult] = await knex.raw("SHOW GLOBAL STATUS LIKE 'Handler_read_rnd_next'");
				const [writeResult] = await knex.raw("SHOW GLOBAL STATUS LIKE 'Handler_write'");
				stats.io.reads = Number.parseInt(readResult[0]?.Value || 0, 10);
				stats.io.writes = Number.parseInt(writeResult[0]?.Value || 0, 10);
			} else if (isPostgres()) {
				stats.engine = "postgresql";
				const sizeResult = await knex.raw("SELECT pg_database_size(current_database()) as size");
				stats.size = Number.parseInt(sizeResult.rows[0]?.size || 0, 10);
				const connResult = await knex.raw(`
					SELECT count(*) as open FROM pg_stat_activity
					WHERE datname = current_database()
				`);
				stats.connections.open = Number.parseInt(connResult.rows[0]?.open || 0, 10);
				const ioResult = await knex.raw(`
					SELECT blks_read, blks_hit, tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted
					FROM pg_stat_database
					WHERE datname = current_database()
				`);
				if (ioResult.rows[0]) {
					stats.io.reads =
						Number.parseInt(ioResult.rows[0].blks_read || 0, 10) +
						Number.parseInt(ioResult.rows[0].blks_hit || 0, 10);
					stats.io.writes =
						Number.parseInt(ioResult.rows[0].tup_inserted || 0, 10) +
						Number.parseInt(ioResult.rows[0].tup_updated || 0, 10) +
						Number.parseInt(ioResult.rows[0].tup_deleted || 0, 10);
				}
			}
			return stats;
		});
		res.json(payload);
	}),
);
export default router;
