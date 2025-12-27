import fs from "node:fs";
import { Tail } from "tail";
import { analytics as logger } from "../logger.js";
import AnalyticCount from "../models/analytic_count.js";
import AnalyticsLogs from "../models/analytics_logs.js";
import ProxyHost from "../models/proxy_host.js";
import dayjs from "dayjs";

const LOG_FILE = "/data/nginx/json_access.log";
const FLUSH_INTERVAL_MS = 10 * 1000; // 10 seconds flush
const RETENTION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour check
const RETENTION_HOURS = 24; // Default retention

class AnalyticsService {
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
	}

	async init() {
		if (!fs.existsSync(this.logFile)) {
			try {
				fs.closeSync(fs.openSync(this.logFile, "w"));
			} catch (err) {
				logger.error(`Could not create log file: ${err.message}`);
				return;
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
			this.tail.on("line", (line) => this.processLine(line));
			this.tail.on("error", (error) => logger.error(`Tail error: ${error}`));
		} catch (err) {
			logger.error(`Failed to initialize tail: ${err.message}`);
		}

		// Start timers
		this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
		this.retentionTimer = setInterval(() => this.runRetention(), RETENTION_INTERVAL_MS);

		// Run retention once on startup
		this.runRetention();
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

		} catch (_err) {
			// Ignore parse errors
		}
	}

	async flush() {
		// 1. Flush Detailed Logs
		if (this.detailedLogBuffer.length > 0) {
			const batch = [...this.detailedLogBuffer];
			this.detailedLogBuffer = []; // Clear immediately

			try {
				// Chunking might be needed for very high traffic, but start simple
				await AnalyticsLogs.query().insert(batch);
			} catch (err) {
				logger.error(`Failed to flush detailed logs: ${err.message}`);
			}
		}

		// 2. Flush Aggregation
		if (this.aggregationBuffer.size > 0) {
			const entries = Array.from(this.aggregationBuffer.values());
			this.aggregationBuffer.clear();

			try {
				await AnalyticCount.knex().transaction(async (trx) => {
					for (const entry of entries) {
						// Note: We might want to "upsert" here if the same minute is flushed twice (e.g. restart),
						// but standard insert is safer for now. We can handle summing in query.
						await AnalyticCount.query(trx).insert({
							proxy_host_id: entry.host_id === 0 ? null : entry.host_id,
							timestamp: entry.timestamp,
							status_code_2xx: entry.status_2xx,
							status_code_3xx: entry.status_3xx,
							status_code_4xx: entry.status_4xx,
							status_code_5xx: entry.status_5xx,
							bytes_sent: entry.bytes,
							request_count: entry.count,
						});
					}
				});
			} catch (err) {
				logger.error(`Failed to flush aggregated counts: ${err.message}`);
			}
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
}

const service = new AnalyticsService();
export default service;
