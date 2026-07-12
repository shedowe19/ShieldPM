import fs from "node:fs";
import dayjs from "dayjs";
import { Tail } from "tail";
import errs from "../lib/error.js";
import { analytics as logger } from "../logger.js";
import AnalyticCount from "../models/analytic_count.js";
import AnalyticsLogs from "../models/analytics_logs.js";
import ProxyHost from "../models/proxy_host.js";

const LOG_FILE = "/data/nginx/json_access.log";
const FLUSH_INTERVAL_MS = 10 * 1000; // 10 seconds flush
const RETENTION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour check
const RETENTION_HOURS = 24; // Default retention
const DETAILED_LOG_BUFFER_LIMIT = 1000;
const AGGREGATION_BUFFER_LIMIT = 500;
const INSERT_CHUNK_SIZE = 250;
const DROP_LOG_INTERVAL_MS = 60 * 1000;

const aggregationKeyFor = (hostId) => (hostId === 0 ? "global" : `host:${hostId}`);

export class AnalyticsService {
	constructor(logFile) {
		this.logFile = logFile || LOG_FILE;
		this.tail = null;

		// Map for aggregation: { "host_id:timestamp_minute": { ...stats } }
		this.aggregationBuffer = new Map();

		// Array for detailed logs
		this.detailedLogBuffer = [];

		// Caches
		this.hostCache = new Map(); // hostname -> id
		this.flushTimer = null;
		this.retentionTimer = null;
		this.flushPromise = null;
		this.initializationPromise = null;
		this.isInitialized = false;
		this.lastDropLogAt = 0;
	}

	async init() {
		if (this.isInitialized) {
			return;
		}
		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		this.initializationPromise = this.initialize();
		try {
			this.isInitialized = await this.initializationPromise;
		} finally {
			this.initializationPromise = null;
		}
	}

	async initialize() {
		try {
			// Using 'wx' flag (write, exclusive) to create file atomically.
			// If file exists, it fails with EEXIST, which we ignore.
			fs.closeSync(fs.openSync(this.logFile, "wx"));
		} catch (err) {
			if (err.code !== "EEXIST") {
				logger.error(`Could not create log file: ${err.message}`);
				return false;
			}
		}

		logger.info(`Starting Analytics Service, watching ${this.logFile}...`);

		// Load initial domains
		await this.loadDomains();
		// Refresh domains every 10 min
		setInterval(() => this.loadDomains(), 10 * 60 * 1000);

		// Tail the log file
		try {
			this.tail = new Tail(this.logFile);
			this.tail.on("line", (line) => {
				// Prevent event loop blocking under high load by deferring processing
				setImmediate(() => this.processLine(line));
			});
			this.tail.on("error", (error) => logger.error(`Tail error: ${error}`));
		} catch (err) {
			logger.error(`Failed to initialize tail: ${err.message}`);
		}

		// Start timers
		this.flushTimer = setInterval(() => {
			void this.flush();
		}, FLUSH_INTERVAL_MS);
		this.retentionTimer = setInterval(() => this.runRetention(), RETENTION_INTERVAL_MS);

		// Run retention once on startup
		this.runRetention();
		return true;
	}

	async loadDomains() {
		try {
			const hosts = await ProxyHost.query().where("is_deleted", 0).select("id", "domain_names");
			const newMap = new Map();
			for (const host of hosts) {
				if (host.domain_names && Array.isArray(host.domain_names)) {
					for (const domain of host.domain_names) {
						newMap.set(domain, host.id);
					}
				}
			}
			this.hostCache = newMap;
			logger.info(`Loaded ${this.hostCache.size} domains for analytics.`);
		} catch (err) {
			logger.error("Failed to load domains for analytics:", err);
		}
	}

	processLine(line) {
		try {
			if (!line.trim()) return;
			// Fix common Nginx JSON log errors if any (e.g. unquoted country code)
			const fixedLine = line.replace(/"geoip_country_code":([A-Z]{2})}/g, '"geoip_country_code":"$1"}');
			const data = JSON.parse(fixedLine);

			// Resolve Host ID
			let hostname = data.server_name;
			if (!hostname || hostname === "_") {
				hostname = data.http_host;
			}
			const hostId = this.hostCache.get(hostname) || 0; // 0 for unknown/unmatched

			const status = Number.parseInt(data.status, 10) || 0;
			const bytes = Number.parseInt(data.body_bytes_sent, 10) || 0;
			// Nginx time is usually ISO8601
			const dayjsTime = dayjs(data.time_iso8601 || new Date());
			// For DB timestamp (ISO string for sqlite usually, or could use unix)
			// Detailed logs use specific time, Aggregation uses minute start
			const detailedTime = dayjsTime.toISOString();
			const startOfMinute = dayjsTime.startOf("minute").toISOString();

			// --- 1. Aggregation Buffer ---
			// Key: "hostId|minuteISO"
			const aggKey = `${hostId}|${startOfMinute}`;

			if (!this.aggregationBuffer.has(aggKey)) {
				this.aggregationBuffer.set(aggKey, {
					host_id: hostId,
					timestamp: startOfMinute,
					count: 0,
					bytes: 0,
					status_2xx: 0,
					status_3xx: 0,
					status_4xx: 0,
					status_5xx: 0,
				});
			}

			const aggEntry = this.aggregationBuffer.get(aggKey);
			aggEntry.count++;
			aggEntry.bytes += bytes;

			if (status >= 200 && status < 300) aggEntry.status_2xx++;
			else if (status >= 300 && status < 400) aggEntry.status_3xx++;
			else if (status >= 400 && status < 500) aggEntry.status_4xx++;
			else if (status >= 500) aggEntry.status_5xx++;

			// --- 2. Detailed Log Buffer ---
			this.detailedLogBuffer.push({
				host_id: hostId,
				time: detailedTime,
				method: data.request_method,
				path: data.request_uri,
				status: status,
				bytes: bytes,
				ip: data.remote_addr,
				country_code: data.geoip_country_code || null,
				referer: data.http_referer || null,
				user_agent: data.http_user_agent || null,
				duration: Math.floor(Number.parseFloat(data.request_time || 0) * 1000), // ms
			});

			this.applyBackpressure();
		} catch (err) {
			// Only ignore parse errors for individual log lines
			if (err instanceof SyntaxError) {
				return; // Ignore malformed JSON lines
			}
			// All other errors (DB, logic, etc.) must be surfaced
			logger.error("Unexpected error in processLine:", err);
			throw err;
		}
	}

	applyBackpressure() {
		let shouldFlush = false;

		if (this.detailedLogBuffer.length >= DETAILED_LOG_BUFFER_LIMIT) {
			shouldFlush = true;
		}

		if (this.aggregationBuffer.size >= AGGREGATION_BUFFER_LIMIT) {
			shouldFlush = true;
		}

		if (shouldFlush) {
			void this.flush();
		}
	}

	chunkArray(items, chunkSize) {
		const chunks = [];
		for (let index = 0; index < items.length; index += chunkSize) {
			chunks.push(items.slice(index, index + chunkSize));
		}
		return chunks;
	}

	logDroppedAnalyticsData(details) {
		const now = Date.now();
		if (now - this.lastDropLogAt < DROP_LOG_INTERVAL_MS) {
			return;
		}

		this.lastDropLogAt = now;
		logger.error(
			`Dropping analytics data due to DB failure (detailed_logs=${details.detailedLogsDropped}, aggregations=${details.aggregationsDropped})`,
		);
	}

	async flushDetailedLogs(batch) {
		if (batch.length === 0) {
			return;
		}

		const tableName = AnalyticsLogs.tableName || "analytics_logs";
		for (const chunk of this.chunkArray(batch, INSERT_CHUNK_SIZE)) {
			await AnalyticsLogs.knex().table(tableName).insert(chunk);
		}
	}

	async flushAggregations(entries) {
		if (entries.length === 0) {
			return;
		}

		const rows = entries.map((entry) => ({
			aggregation_key: aggregationKeyFor(entry.host_id),
			aggregation_timestamp: entry.timestamp,
			aggregation_generation: "live",
			proxy_host_id: entry.host_id === 0 ? null : entry.host_id,
			timestamp: entry.timestamp,
			status_code_2xx: entry.status_2xx,
			status_code_3xx: entry.status_3xx,
			status_code_4xx: entry.status_4xx,
			status_code_5xx: entry.status_5xx,
			bytes_sent: entry.bytes,
			request_count: entry.count,
		}));

		for (const chunk of this.chunkArray(rows, INSERT_CHUNK_SIZE)) {
			// Knex/Objection does not support batch insert with onConflict merge for sqlite/mysql well.
			// Insert individually to prevent "batch insert only works with Postgresql and SQL Server"
			await AnalyticCount.transaction(async (trx) => {
				for (const row of chunk) {
					await AnalyticCount.query(trx)
						.insert(row)
						.onConflict(["aggregation_key", "aggregation_timestamp", "aggregation_generation"])
						.merge({
							status_code_2xx: AnalyticCount.knex().raw(
								"coalesce(analytic_count.status_code_2xx, 0) + ?",
								[row.status_code_2xx],
							),
							status_code_3xx: AnalyticCount.knex().raw(
								"coalesce(analytic_count.status_code_3xx, 0) + ?",
								[row.status_code_3xx],
							),
							status_code_4xx: AnalyticCount.knex().raw(
								"coalesce(analytic_count.status_code_4xx, 0) + ?",
								[row.status_code_4xx],
							),
							status_code_5xx: AnalyticCount.knex().raw(
								"coalesce(analytic_count.status_code_5xx, 0) + ?",
								[row.status_code_5xx],
							),
							bytes_sent: AnalyticCount.knex().raw("coalesce(analytic_count.bytes_sent, 0) + ?", [
								row.bytes_sent,
							]),
							request_count: AnalyticCount.knex().raw("coalesce(analytic_count.request_count, 0) + ?", [
								row.request_count,
							]),
						});
				}
			});
		}
	}

	async flush() {
		if (this.flushPromise) {
			return this.flushPromise;
		}

		this.flushPromise = (async () => {
			const detailedBatch = this.detailedLogBuffer;
			const aggregationBatch = Array.from(this.aggregationBuffer.values());

			this.detailedLogBuffer = [];
			this.aggregationBuffer = new Map();

			try {
				await this.flushDetailedLogs(detailedBatch);
			} catch (err) {
				logger.error(`Failed to flush detailed logs: ${err.message}`);
				const restoredDetailedLogs = detailedBatch.concat(this.detailedLogBuffer);
				const detailedLogsDropped = Math.max(0, restoredDetailedLogs.length - DETAILED_LOG_BUFFER_LIMIT);
				this.detailedLogBuffer = restoredDetailedLogs.slice(-DETAILED_LOG_BUFFER_LIMIT);
				if (detailedLogsDropped > 0) {
					this.logDroppedAnalyticsData({ detailedLogsDropped, aggregationsDropped: 0 });
				}
			}

			try {
				await this.flushAggregations(aggregationBatch);
			} catch (err) {
				logger.error(`Failed to flush aggregated counts: ${err.message}`);
				let aggregationsDropped = 0;
				for (const entry of aggregationBatch) {
					const key = `${entry.host_id}|${entry.timestamp}`;
					const existing = this.aggregationBuffer.get(key);
					if (existing) {
						existing.count += entry.count;
						existing.bytes += entry.bytes;
						existing.status_2xx += entry.status_2xx;
						existing.status_3xx += entry.status_3xx;
						existing.status_4xx += entry.status_4xx;
						existing.status_5xx += entry.status_5xx;
					} else if (this.aggregationBuffer.size < AGGREGATION_BUFFER_LIMIT) {
						this.aggregationBuffer.set(key, entry);
					} else {
						aggregationsDropped++;
					}
				}
				if (aggregationsDropped > 0) {
					this.logDroppedAnalyticsData({ detailedLogsDropped: 0, aggregationsDropped });
				}
			}
		})();

		try {
			await this.flushPromise;
		} finally {
			this.flushPromise = null;
		}
	}

	async runRetention() {
		try {
			const cutoff = dayjs().subtract(RETENTION_HOURS, "hour").toISOString();
			const deleted = await AnalyticsLogs.query().where("time", "<", cutoff).delete();
			if (deleted > 0) {
				logger.info(`Analytics Retention: Cleaned up ${deleted} old log entries.`);
			}
		} catch (err) {
			logger.error(`Failed to run retention: ${err.message}`);
		}
	}
	/**
	 * Get aggregated summary for a host (Top Lists)
	 * @param {number} hostId
	 * @param {String} range (1h, 24h, 7d, 30d)
	 */
	async assertHostAccess(access, hostId) {
		const host = await ProxyHost.query().where("id", hostId).andWhere("is_deleted", 0).first();
		if (!host) {
			throw new errs.ItemNotFoundError("Host not found");
		}

		// Check if user has analytics permission - if so, allow access to any host
		// (proxy-hosts visibility already filters which hosts are shown to the user)
		try {
			const analyticsPerm = await access.can("analytics:list");
			if (
				analyticsPerm &&
				(analyticsPerm.permission_analytics === "manage" || analyticsPerm.permission_analytics === "view")
			) {
				return host;
			}
		} catch (_err) {
			// Fall through to legacy admin/owner check
		}

		const userId = access?.token?.getUserId?.(0) || 0;
		const isAdmin = access?.token?.hasScope?.("admin") || false;
		if (!isAdmin && host.owner_user_id !== userId) {
			throw new errs.PermissionError("You do not have permission to access analytics for this host.");
		}

		return host;
	}

	async getHostSummary(access, hostId, range) {
		await this.assertHostAccess(access, hostId);

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

		const sinceIso = since.toISOString();
		const knex = AnalyticsLogs.knex();

		// Parallel execution for speed
		const [topCountries, topIps, topReferers, topUserAgents, topPaths, recent, resultTotals] = await Promise.all([
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
				.first(),
		]);

		const totals = resultTotals || {};
		const getNum = (obj, keys) => {
			for (const k of keys) {
				if (obj[k] !== undefined && obj[k] !== null) return Number(obj[k]);
			}
			return 0;
		};

		return {
			range,
			since: sinceIso,
			stats: {
				count: getNum(totals, ["count", "COUNT", "request_count"]),
				status_2xx: getNum(totals, ["s2xx", "S2XX", "status_code_2xx"]),
				status_3xx: getNum(totals, ["s3xx", "S3XX", "status_code_3xx"]),
				status_4xx: getNum(totals, ["s4xx", "S4XX", "status_code_4xx"]),
				status_5xx: getNum(totals, ["s5xx", "S5XX", "status_code_5xx"]),
			},
			top_countries: topCountries,
			top_ips: topIps,
			top_referers: topReferers,
			top_user_agents: topUserAgents,
			top_paths: topPaths,
			recent_requests: recent,
		};
	}
}

const service = new AnalyticsService();
export default service;
