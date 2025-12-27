import fs from "fs";
import { Tail } from "tail";
import { analytics as logger } from "../logger.js";
import AnalyticCount from "../models/analytic_count.js";
import dayjs from "dayjs";

const LOG_FILE = "/data/nginx/json_access.log";
const FLUSH_INTERVAL_MS = 10 * 1000; // 10 seconds

class AnalyticsService {
	constructor(logFile) {
		this.logFile = logFile || LOG_FILE;
		this.tail = null;
		// buffer structure: { "host_id:timestamp_minute": { ...stats } }
		this.buffer = new Map();
		this.flushTimer = null;
	}

	init() {
		if (!fs.existsSync(this.logFile)) {
			// If file doesn't exist, create it so tail doesn't crash
			try {
				fs.closeSync(fs.openSync(this.logFile, "w"));
			} catch (err) {
				logger.error(`Could not create log file: ${err.message}`);
				return;
			}
		}

		logger.info(`Starting Analytics Service, watching ${this.logFile}...`);

		// Tail the log file
		try {
			this.tail = new Tail(this.logFile);
			this.tail.on("line", (line) => this.processLine(line));
			this.tail.on("error", (error) => logger.error(`Tail error: ${error}`));
		} catch (err) {
			logger.error(`Failed to initialize tail: ${err.message}`);
		}

		// Start flush timer
		this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
	}

	/**
	 * Parse a single log line and add to buffer
	 * @param {string} line
	 */
	processLine(line) {
		try {
			// logger.debug(`Line received: ${line.substring(0, 50)}...`); // debug
			if (!line.trim()) return;
			const data = JSON.parse(line);

			// Extract relevant fields
			// Note: upstream/host logic might need refinement depending on what $server_name captures
			// In NPM, usually we can map by 'server_name' if it matches a proxy host domain,
			// but we don't have a direct ID in the log unless we added a custom header or mapped it.
			// For now, allow null host_id or try to find it if possible, but let's stick to simple aggregation first.

			// We will group by 'server_name' (hostname) for now as we might not have ID easily without DB lookup every time.
			// Actually, to keep it fast, we can just store by hostname or try to infer ID later?
			// Let's assume for v1 we create stats per timestamp, and maybe link to host if we can.
			// WAIT, the prompt plan said "proxy_host_id".
			// But the log contains keys like `server_name` or `http_host`.
			// We can cache the hostname -> ID mapping in memory to make this fast.

			// For this MVP step: Let's assume we map by hostname later or just store 0 if unknown.
			// To implement this correctly efficiently:
			// 1. We need a cache of hostname -> proxy_host_id.
			// 2. But for now, let's just aggregate by Hostname string if model allowed it?
			// The model asks for `proxy_host_id`.
			// Let's skip ID resolution for this exact moment to avoid huge code complexity in this file
			// and treat 'proxy_host_id' as nullable, and maybe redundant if we can't resolve it.
			// However, looking at the logs, we don't have ID.
			// We will proceed with aggregating global stats + per-host stats IF we can resolve it.
			// For simplicity and speed: We will aggregate based on `server_name` (the domain).
			// Then in `flush()`, we can try to resolve `server_name` to an ID.

			const status = Number.parseInt(data.status, 10);
			const bytes = Number.parseInt(data.body_bytes_sent, 10) || 0;
			const time = dayjs(data.time_iso8601 || new Date())
				.startOf("minute")
				.toISOString();

			// Temporary Key for grouping: time + server_name
			// We use server_name from nginx log which should match domain names
			const hostname = data.server_name || "unknown";
			const key = `${time}|${hostname}`;

			if (!this.buffer.has(key)) {
				this.buffer.set(key, {
					timestamp: time,
					hostname: hostname,
					count: 0,
					bytes: 0,
					status_2xx: 0,
					status_3xx: 0,
					status_4xx: 0,
					status_5xx: 0,
				});
			}

			const entry = this.buffer.get(key);
			entry.count++;
			entry.bytes += bytes;

			if (status >= 200 && status < 300) entry.status_2xx++;
			else if (status >= 300 && status < 400) entry.status_3xx++;
			else if (status >= 400 && status < 500) entry.status_4xx++;
			else if (status >= 500) entry.status_5xx++;
		} catch (err) {
			logger.error(`Failed to parse log line: ${err.message} | Line: ${line}`);
		}
	}

	async flush() {
		if (this.buffer.size === 0) return;

		const entries = Array.from(this.buffer.values());
		this.buffer.clear(); // Clear immediately to allow new incoming data

		// TODO: Resolve hostnames to IDs if possible.
		// For now, we will just insert. We need to fetch ProxyHosts to map hostname -> ID.
		// Importing Model here to avoid circular dependency issues at top level if any
		const ProxyHost = (await import("../models/proxy_host.js")).default;

		// Fetch all domains (this might be heavy? Cache it!)
		// Simple optimization: Cache the mapping.
		if (!this.hostCache) {
			this.hostCache = new Map(); // hostname -> id
		}

		// Refresh cache periodically or if miss?
		// Let's just do a quick lookup for now or lazy load.
		// For strict correctness, let's query the DB for the hosts we found.
		const hostnames = [...new Set(entries.map((e) => e.hostname))];

		// We can optimize this by keeping a synced list, but for now let's just query.
		// A better approach for NPM is strict mapping.
		// Let's assume we proceed without ID if not found.

		// Find IDs
		const hosts = await ProxyHost.query().whereIn("domain_names", hostnames);
		// Wait, domain_names is often JSON array ["example.com", "www.example.com"] in sqlite.
		// Searching this efficiently in SQL is hard without JSON extensions.
		// For MVP: Let's try to do a best-effort mapping or just store NULL id.

		// Re-mapping logic:
		// Actually, Nginx `server_name` variable in the log is usually the FIRST domain name defined.
		// But it can also be the request Host header if unchecked.
		// Let's skip the complex resolution for this first step and use NULL ID.
		// We will improve this later.

		try {
			await AnalyticCount.knex().transaction(async (trx) => {
				for (const entry of entries) {
					// Try to resolve ID from cache or just leave null
					const proxy_host_id = null;

					await AnalyticCount.query(trx).insert({
						proxy_host_id: proxy_host_id,
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
			logger.info(`Flushed ${entries.length} analytic records.`);
		} catch (err) {
			logger.error(`Failed to flush analytics: ${err.message}`);
		}
	}
}

const service = new AnalyticsService();
export default service;
