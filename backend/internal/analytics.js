import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import dayjs from "dayjs";
import { Tail } from "tail";
import { resolveAnalyticsRange } from "../lib/analytics-range.js";
import { buildAnalyticsEventKey, insertAnalyticsLogs, upsertAnalyticsRows } from "../lib/analytics-upsert.js";
import errs from "../lib/error.js";
import { subscribeProxyHostDomains } from "../lib/proxy-host-domain-events.js";
import { analytics as logger } from "../logger.js";
import AnalyticCount from "../models/analytic_count.js";
import AnalyticsLogs from "../models/analytics_logs.js";
import ProxyHost from "../models/proxy_host.js";

const LOG_FILE = path.join(process.env.DATA_PATH || "/data", "nginx", "json_access.log");
const FLUSH_INTERVAL_MS = 10 * 1000; // 10 seconds flush
const RETENTION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour check
const SUMMARY_CACHE_TTL_MS = FLUSH_INTERVAL_MS;
const DETAILED_LOG_BUFFER_LIMIT = 1000;
const AGGREGATION_BUFFER_LIMIT = 500;
const PENDING_LINE_BUFFER_LIMIT = 2000;
const PROCESS_LINE_BATCH_SIZE = 250;
const INSERT_CHUNK_SIZE = 250;
const DROP_LOG_INTERVAL_MS = 60 * 1000;
const INGEST_STREAM = "json_access";
const BACKFILL_CHUNK_SIZE = 64 * 1024;
const BACKFILL_FLUSH_THRESHOLD = 500;
const ANUBIS_DEDUPE_WINDOW_MS = 2000;
const REQUEST_SIGNATURE_LIMIT = 5000;
const REQUEST_SIGNATURE_TTL_MS = 15 * 1000;

const retentionLimits = {
	detailedHours: { fallback: 24, max: 8760, min: 1, name: "ANALYTICS_DETAILED_RETENTION_HOURS" },
	aggregationDays: { fallback: 35, max: 3650, min: 1, name: "ANALYTICS_AGGREGATION_RETENTION_DAYS" },
};

const readRetentionValue = (env, limits) => {
	const raw = env?.[limits.name];
	if (raw === undefined || raw === null || String(raw).trim() === "") return limits.fallback;

	const value = Number(raw);
	if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
		logger.error(
			`Invalid ${limits.name}="${raw}"; expected an integer between ${limits.min} and ${limits.max}. Using ${limits.fallback}.`,
		);
		return limits.fallback;
	}
	return value;
};

/**
 * Resolve and validate retention settings. Invalid, negative or non-integer values fall back to
 * the documented defaults and can never turn a retention run into "delete everything" or "never delete".
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ detailedHours: number, aggregationDays: number }}
 */
export const resolveRetentionConfig = (env = process.env) => ({
	aggregationDays: readRetentionValue(env, retentionLimits.aggregationDays),
	detailedHours: readRetentionValue(env, retentionLimits.detailedHours),
});

/**
 * Resolve the defined first-run start of the log stream.
 * @param {string | undefined} raw
 * @returns {"beginning" | "end"}
 */
export const resolveIngestStartMode = (raw) => {
	const value = String(raw || "beginning")
		.trim()
		.toLowerCase();
	if (value === "beginning" || value === "end") return value;
	logger.error(`Invalid ANALYTICS_INGEST_START_MODE="${raw}"; expected "beginning" or "end". Using "beginning".`);
	return "beginning";
};

const retentionConfig = resolveRetentionConfig();
const DETAILED_RETENTION_HOURS = retentionConfig.detailedHours;
const AGGREGATION_RETENTION_DAYS = retentionConfig.aggregationDays;
const INGEST_START_MODE = resolveIngestStartMode(process.env.ANALYTICS_INGEST_START_MODE);

const aggregationKeyFor = (hostId) => (hostId === 0 ? "global" : `host:${hostId}`);

const isUnixSocketAddress = (value) =>
	typeof value === "string" && (value === "unix" || value === "unix:" || value.startsWith("unix:"));

export class AnalyticsService {
	constructor(logFile, options = {}) {
		this.logFile = logFile || LOG_FILE;
		this.tail = null;
		this.startMode = options.startMode || INGEST_START_MODE;
		this.stateStore = options.stateStore || null;

		// Map for aggregation: { "host_id:timestamp_minute": { ...stats } }
		this.aggregationBuffer = new Map();

		// Array for detailed logs
		this.detailedLogBuffer = [];

		// Caches
		this.hostCache = new Map(); // hostname -> id
		this.anubisHostIds = new Set();
		this.requestSignatures = new Map();
		this.domainRefreshTimer = null;
		this.domainLoadPromise = null;
		this.domainRevision = 0;
		this.domainAppliedRevision = -1;
		this.domainGeneration = 0;
		this.unsubscribeDomains = null;
		this.flushTimer = null;
		this.retentionTimer = null;
		this.flushPromise = null;
		this.initializationPromise = null;
		this.isInitialized = false;
		this.lastDropLogAt = 0;
		this.lineQueue = [];
		this.lineDrainScheduled = false;
		this.droppedLineCount = 0;
		this.internalHopDroppedCount = 0;
		this.anubisDuplicatesDropped = 0;
		this.summaryCache = new Map();
		this.persistedOffset = 0;
		this.currentFileSize = 0;
		this.ingestedLineCount = 0;
		this.backfillLineCount = 0;
		this.lastLineAt = null;
		this.lastFlushSucceeded = true;
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
		const generation = this.domainGeneration;
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
		const unsubscribe = subscribeProxyHostDomains(() => {
			this.domainRevision++;
			return this.loadDomains();
		});
		this.unsubscribeDomains = unsubscribe;
		await this.loadDomains();
		if (generation !== this.domainGeneration) {
			unsubscribe();
			return false;
		}

		// Resume from the persisted byte offset and replay everything written while the service was down.
		let startOffset = this.persistedOffset;
		try {
			startOffset = await this.resumeFromPersistedOffset();
		} catch (err) {
			// Keep the previous offset and still start the tail: data is replayed (idempotently) instead of skipped.
			logger.error(`Analytics backlog recovery failed: ${err.message}`);
			let stat = null;
			try {
				stat = this.statFile(this.logFile);
			} catch {
				stat = null;
			}
			startOffset = stat && this.persistedOffset > stat.size ? 0 : this.persistedOffset;
		}

		// Tail the log file
		try {
			this.tail = new Tail(this.logFile, { fromBeginning: false });
			this.tail.on("line", (line) => this.enqueueLine(line));
			this.tail.on("error", (error) => logger.error(`Tail error: ${error}`));
			// The tail starts at the current end. Rewind it to the last committed line boundary so the
			// gap between the backfill read and the watcher is read as well.
			if (typeof this.tail.currentCursorPos === "number" && typeof this.tail.change === "function") {
				this.tail.currentCursorPos = startOffset;
				this.tail.change();
			}
		} catch (err) {
			logger.error(`Failed to initialize tail: ${err.message}`);
			unsubscribe();
			if (this.unsubscribeDomains === unsubscribe) this.unsubscribeDomains = null;
			return false;
		}

		// Refresh domains every 10 min only after the tail is active.
		this.domainRefreshTimer = setInterval(() => void this.loadDomains(), 10 * 60 * 1000);

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
		const generation = this.domainGeneration;
		while (generation === this.domainGeneration) {
			const pending = this.domainLoadPromise || this.readDomains(generation);
			this.domainLoadPromise = pending;
			let applied;
			try {
				applied = await pending;
			} finally {
				if (this.domainLoadPromise === pending) this.domainLoadPromise = null;
			}
			// A change can arrive after publication but before the shared promise clears.
			if (!applied || this.domainAppliedRevision === this.domainRevision) return;
		}
	}

	async readDomains(generation) {
		try {
			while (generation === this.domainGeneration) {
				const revision = this.domainRevision;
				const hosts = await ProxyHost.query()
					.where("is_deleted", 0)
					.select("id", "anubis_enabled")
					.withGraphFetched("host_domains");
				if (generation !== this.domainGeneration) return;
				// A committed change during the read requires a fresh snapshot before publication.
				if (revision !== this.domainRevision) continue;
				const newMap = new Map();
				const anubisHostIds = new Set();
				for (const host of hosts) {
					const hostId = Number(host.id);
					if (Number(host.anubis_enabled) === 1) {
						anubisHostIds.add(hostId);
					}
					if (host.domain_names && Array.isArray(host.domain_names)) {
						for (const domain of host.domain_names) {
							newMap.set(domain.toLowerCase(), hostId);
						}
					}
				}
				this.hostCache = newMap;
				this.anubisHostIds = anubisHostIds;
				this.domainAppliedRevision = revision;
				logger.info(`Loaded ${this.hostCache.size} domains for analytics.`);
				return true;
			}
		} catch (err) {
			logger.error("Failed to load domains for analytics:", err);
			return false;
		}
	}

	get detailRetentionHours() {
		return DETAILED_RETENTION_HOURS;
	}

	get aggregateRetentionDays() {
		return AGGREGATION_RETENTION_DAYS;
	}

	getStatus() {
		return {
			aggregationBufferSize: this.aggregationBuffer.size,
			aggregateRetentionDays: AGGREGATION_RETENTION_DAYS,
			anubisDuplicatesDropped: this.anubisDuplicatesDropped,
			backfillLineCount: this.backfillLineCount,
			detailRetentionHours: DETAILED_RETENTION_HOURS,
			detailedBufferSize: this.detailedLogBuffer.length,
			droppedLineCount: this.droppedLineCount,
			ingestedLineCount: this.ingestedLineCount,
			ingestionStartMode: this.startMode,
			internalHopDroppedCount: this.internalHopDroppedCount,
			lagBytes: Math.max(0, this.currentFileSize - this.persistedOffset),
			lastFlushSucceeded: this.lastFlushSucceeded,
			lastLineAt: this.lastLineAt,
			lastOffset: this.persistedOffset,
			lineQueueSize: this.lineQueue.length,
		};
	}

	enqueueLine(line) {
		if (this.lineQueue.length >= PENDING_LINE_BUFFER_LIMIT) {
			this.droppedLineCount++;
			this.logDroppedAnalyticsData({ detailedLogsDropped: 1, aggregationsDropped: 0 });
			return;
		}
		this.lineQueue.push(line);
		if (this.lineDrainScheduled) return;
		this.lineDrainScheduled = true;
		setImmediate(() => this.drainLineQueue());
	}

	drainLineQueue() {
		this.lineDrainScheduled = false;
		for (const line of this.lineQueue.splice(0, PROCESS_LINE_BATCH_SIZE)) {
			try {
				this.processLine(line);
			} catch (error) {
				logger.error(`Analytics line processing failed: ${error.message}`);
			}
		}
		if (this.lineQueue.length > 0) {
			this.lineDrainScheduled = true;
			setImmediate(() => this.drainLineQueue());
		}
	}

	async stop() {
		clearInterval(this.domainRefreshTimer);
		this.domainRefreshTimer = null;
		this.unsubscribeDomains?.();
		this.unsubscribeDomains = null;
		this.domainGeneration++;
		this.domainLoadPromise = null;
		clearInterval(this.flushTimer);
		clearInterval(this.retentionTimer);
		this.tail?.unwatch?.();
		this.tail = null;
		this.lineDrainScheduled = false;
		for (const line of this.lineQueue.splice(0)) this.processLine(line);
		try {
			await this.replayRemainingTail();
		} catch (err) {
			logger.error(`Failed to replay remaining analytics log: ${err.message}`);
		}
		await this.flush();
		this.isInitialized = false;
	}

	async replayRemainingTail() {
		if (typeof fs.statSync !== "function") return;
		const stat = this.statFile(this.logFile);
		if (!stat || stat.size <= this.persistedOffset) return;
		const result = await this.backfillFile(this.logFile, this.persistedOffset);
		await this.saveIngestState({ lastLineAt: this.lastLineAt, offset: result.offset, stat });
	}

	processLine(line) {
		try {
			if (!line.trim()) return;
			// Fix common Nginx JSON log errors if any (e.g. unquoted country code)
			const fixedLine = line.replace(/"geoip_country_code":([A-Z]{2})}/g, '"geoip_country_code":"$1"}');
			const data = JSON.parse(fixedLine);
			if (!data || typeof data !== "object" || Array.isArray(data)) return;

			const remoteAddr = typeof data.remote_addr === "string" ? data.remote_addr.trim() : "";
			// The internal Anubis listener is a unix socket; those lines never represent a second visitor request.
			if (isUnixSocketAddress(remoteAddr)) {
				this.internalHopDroppedCount++;
				return;
			}

			// Resolve Host ID
			let hostname = data.server_name;
			if (!hostname || hostname === "_") {
				hostname = data.http_host;
			}
			const normalizedHost = typeof hostname === "string" ? hostname.toLowerCase().replace(/:\d+$/, "") : "";
			const hostId = this.hostCache.get(normalizedHost) || 0; // 0 for unknown/unmatched

			const status = Number.parseInt(data.status, 10) || 0;
			const bytes = Number.parseInt(data.body_bytes_sent, 10) || 0;
			// Nginx time is usually ISO8601
			const dayjsTime = dayjs(data.time_iso8601 || new Date());
			if (!dayjsTime.isValid()) return;

			// Anubis enables two server blocks for one request. Without a hop marker in the JSON log,
			// collapse the second identical line (same host/IP/method/URI/status/bytes within the window).
			if (this.isAnubisInternalDuplicate(hostId, data, remoteAddr, dayjsTime)) {
				this.anubisDuplicatesDropped++;
				return;
			}

			// For DB timestamp (ISO string for sqlite usually, or could use unix)
			// Detailed logs use specific time, Aggregation uses minute start
			const detailedTime = dayjsTime.toISOString();
			const startOfMinute = dayjsTime.startOf("minute").toISOString();
			const duration = Math.max(0, Math.floor(Number.parseFloat(data.request_time || 0) * 1000) || 0); // ms
			const eventKey = buildAnalyticsEventKey({
				bytes,
				duration,
				hostId,
				ip: remoteAddr,
				method: data.request_method,
				path: data.request_uri,
				requestId: data.request_id || data.requestid,
				status,
				time: detailedTime,
			});

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
				created_at: Date.now(),
				method: data.request_method,
				path: data.request_uri,
				status: status,
				bytes: bytes,
				ip: remoteAddr,
				country_code: data.geoip_country_code || null,
				referer: data.http_referer || null,
				user_agent: data.http_user_agent || null,
				duration: duration,
				event_key: eventKey,
			});

			this.ingestedLineCount++;
			this.lastLineAt = detailedTime;
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

	isAnubisInternalDuplicate(hostId, data, remoteAddr, time) {
		if (!this.anubisHostIds.has(hostId)) return false;

		const signature = [
			String(hostId),
			remoteAddr,
			data.request_method || "",
			data.request_uri || "",
			String(Number.parseInt(data.status, 10) || 0),
			String(Number.parseInt(data.body_bytes_sent, 10) || 0),
		].join("\u0000");
		const seenAt = time.valueOf();
		const previous = this.requestSignatures.get(signature);
		if (previous !== undefined && Math.abs(seenAt - previous) <= ANUBIS_DEDUPE_WINDOW_MS) return true;

		this.requestSignatures.set(signature, seenAt);
		if (this.requestSignatures.size > REQUEST_SIGNATURE_LIMIT) this.pruneRequestSignatures(seenAt);
		return false;
	}

	pruneRequestSignatures(now) {
		for (const [signature, seenAt] of this.requestSignatures) {
			if (now - seenAt > REQUEST_SIGNATURE_TTL_MS) this.requestSignatures.delete(signature);
		}
		while (this.requestSignatures.size > REQUEST_SIGNATURE_LIMIT) {
			const oldest = this.requestSignatures.keys().next().value;
			if (oldest === undefined) break;
			this.requestSignatures.delete(oldest);
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
		// A slow database must not allow the next in-memory batch to grow without bound.
		const detailedLogsDropped = Math.max(0, this.detailedLogBuffer.length - DETAILED_LOG_BUFFER_LIMIT);
		if (detailedLogsDropped) this.detailedLogBuffer.splice(0, detailedLogsDropped);
		let aggregationsDropped = 0;
		while (this.aggregationBuffer.size > AGGREGATION_BUFFER_LIMIT) {
			this.aggregationBuffer.delete(this.aggregationBuffer.keys().next().value);
			aggregationsDropped++;
		}
		if (detailedLogsDropped || aggregationsDropped) {
			this.logDroppedAnalyticsData({ detailedLogsDropped, aggregationsDropped });
		}
	}

	logDroppedAnalyticsData(details) {
		const now = Date.now();
		if (now - this.lastDropLogAt < DROP_LOG_INTERVAL_MS) {
			return;
		}

		this.lastDropLogAt = now;
		logger.error(
			`Dropping analytics data due to DB failure or backpressure (detailed_logs=${details.detailedLogsDropped}, aggregations=${details.aggregationsDropped})`,
		);
	}

	aggregationEntriesFromLogs(rows) {
		const entries = new Map();
		for (const row of rows) {
			const timestamp = dayjs(row.time).startOf("minute").toISOString();
			const key = `${row.host_id}|${timestamp}`;
			let entry = entries.get(key);
			if (!entry) {
				entry = {
					host_id: Number(row.host_id),
					timestamp,
					count: 0,
					bytes: 0,
					status_2xx: 0,
					status_3xx: 0,
					status_4xx: 0,
					status_5xx: 0,
				};
				entries.set(key, entry);
			}
			const status = Number.parseInt(row.status, 10) || 0;
			entry.count++;
			entry.bytes += Number.parseInt(row.bytes, 10) || 0;
			if (status >= 200 && status < 300) entry.status_2xx++;
			else if (status >= 300 && status < 400) entry.status_3xx++;
			else if (status >= 400 && status < 500) entry.status_4xx++;
			else if (status >= 500) entry.status_5xx++;
		}
		return [...entries.values()];
	}

	async flushBatch(detailedBatch, aggregationBatch) {
		if (detailedBatch.length === 0 && aggregationBatch.length === 0) {
			return;
		}

		const knex = typeof AnalyticsLogs.knex === "function" ? AnalyticsLogs.knex() : null;
		if (!knex) throw new errs.InternalError("Analytics database is not available");

		// Detail insert and aggregate update share one transaction: a committed batch can never leave
		// aggregates behind, and a retried batch sees its event keys and adds no counters twice.
		await knex.transaction(async (trx) => {
			const freshRows = await insertAnalyticsLogs(AnalyticsLogs, detailedBatch, INSERT_CHUNK_SIZE, trx);
			await this.flushAggregations(this.aggregationEntriesFromLogs(freshRows), trx);
		});
	}

	async flushAggregations(entries, trx = null) {
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

		if (trx) {
			await upsertAnalyticsRows(AnalyticCount, rows, INSERT_CHUNK_SIZE, trx);
			return;
		}
		await upsertAnalyticsRows(AnalyticCount, rows, INSERT_CHUNK_SIZE);
	}

	async flush() {
		if (this.flushPromise) {
			await this.flushPromise;
			return this.lastFlushSucceeded;
		}

		this.flushPromise = (async () => {
			const detailedBatch = this.detailedLogBuffer;
			const aggregationBatch = Array.from(this.aggregationBuffer.values());
			// Capture the offset covered by this batch before new lines can arrive.
			// Persisting a later cursor would skip rows that are still uncommitted.
			const batchOffset = this.getReadableOffset();

			this.detailedLogBuffer = [];
			this.aggregationBuffer = new Map();

			try {
				await this.flushBatch(detailedBatch, aggregationBatch);
				this.lastFlushSucceeded = true;
				await this.persistOffset(batchOffset);
			} catch (err) {
				this.lastFlushSucceeded = false;
				logger.error(`Failed to flush analytics batch: ${err.message}`);
				const restoredDetailedLogs = detailedBatch.concat(this.detailedLogBuffer);
				const detailedLogsDropped = Math.max(0, restoredDetailedLogs.length - DETAILED_LOG_BUFFER_LIMIT);
				this.detailedLogBuffer = restoredDetailedLogs.slice(-DETAILED_LOG_BUFFER_LIMIT);
				if (detailedLogsDropped > 0) {
					this.logDroppedAnalyticsData({ aggregationsDropped: 0, detailedLogsDropped });
				}

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
					this.logDroppedAnalyticsData({ aggregationsDropped, detailedLogsDropped: 0 });
				}
			}
		})();

		try {
			await this.flushPromise;
		} finally {
			this.summaryCache.clear();
			this.flushPromise = null;
		}
		return this.lastFlushSucceeded;
	}

	statFile(filePath) {
		try {
			const stat = fs.statSync(filePath);
			if (!stat || typeof stat.size !== "number") return null;
			if (filePath === this.logFile) this.currentFileSize = stat.size;
			return {
				identity: `${stat.dev ?? ""}:${stat.ino ?? ""}`,
				size: stat.size,
			};
		} catch (err) {
			if (err?.code === "ENOENT") return null;
			throw err;
		}
	}

	readHeadSignature(filePath) {
		try {
			const descriptor = fs.openSync(filePath, "r");
			try {
				// Hash the first complete log line: appends keep it stable, while rotation or
				// truncation changes it even when both files start with the same JSON prefix.
				const buffer = Buffer.alloc(4096);
				const read = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
				if (read <= 0) return null;
				const firstLineEnd = buffer.subarray(0, read).indexOf(0x0a);
				const sample = firstLineEnd >= 0 ? buffer.subarray(0, firstLineEnd + 1) : buffer.subarray(0, read);
				return createHash("sha256").update(sample).digest("hex");
			} finally {
				fs.closeSync(descriptor);
			}
		} catch {
			return null;
		}
	}

	async loadIngestState() {
		if (this.stateStore) return this.stateStore.load();
		const knex = typeof AnalyticCount.knex === "function" ? AnalyticCount.knex() : null;
		if (!knex) return null;
		try {
			return await knex("analytics_ingest_state").where("stream", INGEST_STREAM).first();
		} catch (err) {
			logger.error(`Failed to load the analytics ingestion offset: ${err.message}`);
			return null;
		}
	}

	/** True when a previous release already wrote analytics rows without an offset. */
	async hasExistingAnalyticsRows() {
		const knex = typeof AnalyticsLogs.knex === "function" ? AnalyticsLogs.knex() : null;
		if (!knex) return false;
		try {
			const row = await knex("analytics_logs").select("id").limit(1).first();
			return Boolean(row);
		} catch (err) {
			logger.error(`Failed to inspect existing analytics rows: ${err.message}`);
			return false;
		}
	}

	async saveIngestState({ offset, stat, lastLineAt }) {
		if (!Number.isInteger(offset) || offset < 0) return;
		this.persistedOffset = offset;

		const record = {
			byte_offset: offset,
			file_identity: stat?.identity ?? null,
			file_size: stat?.size ?? 0,
			head_signature: this.readHeadSignature(this.logFile),
			last_line_at: lastLineAt || null,
			stream: INGEST_STREAM,
			updated_at: Date.now(),
		};

		if (this.stateStore) {
			await this.stateStore.save(record);
			return;
		}

		const knex = typeof AnalyticCount.knex === "function" ? AnalyticCount.knex() : null;
		if (!knex) return;
		try {
			await knex("analytics_ingest_state").insert(record).onConflict("stream").merge(record);
		} catch (err) {
			// A lost offset only causes an idempotent replay on the next start.
			logger.error(`Failed to persist the analytics ingestion offset: ${err.message}`);
		}
	}

	async resumeFromPersistedOffset() {
		const stat = this.statFile(this.logFile);
		if (!stat) return this.persistedOffset;

		const state = await this.loadIngestState();
		if (!state) {
			// An upgrade from a release without ingestion state already has rows and
			// aggregates. Replaying the whole log would count them a second time.
			const hasExistingData = await this.hasExistingAnalyticsRows();
			if (this.startMode === "end" || hasExistingData) {
				logger.info(
					hasExistingData
						? `Existing analytics data found without an ingestion offset; starting at the current end (${stat.size} bytes) to avoid double counting.`
						: `No analytics ingestion offset found; starting at the current end (${stat.size} bytes).`,
				);
				await this.saveIngestState({ lastLineAt: null, offset: stat.size, stat });
				return stat.size;
			}
			logger.info("No analytics ingestion offset found; replaying the existing log from the beginning.");
			const result = await this.backfillFile(this.logFile, 0);
			await this.saveIngestState({
				lastLineAt: this.lastLineAt,
				offset: result.offset,
				stat: this.statFile(this.logFile) || stat,
			});
			return result.offset;
		}

		const stateOffset = Math.max(0, Number(state.byte_offset) || 0);
		this.persistedOffset = stateOffset;
		const stateHead = state.head_signature || null;
		const currentHead = this.readHeadSignature(this.logFile);
		const truncated = stat.size < stateOffset;
		const replaced = Boolean(stateHead && currentHead && stateHead !== currentHead);
		const rotated = Boolean(state.file_identity && stat.identity && state.file_identity !== stat.identity);
		const rotatedPath = `${this.logFile}.1`;
		const rotatedStat =
			typeof fs.existsSync === "function" && fs.existsSync(rotatedPath) ? this.statFile(rotatedPath) : null;
		const rotationTailPending = Boolean(rotatedStat && rotatedStat.size > stateOffset);

		let result;
		if (rotated || rotationTailPending) {
			// Covers rename rotation and copytruncate: .1 is the previous file content.
			logger.warn("Analytics log rotation detected; replaying the rotated file tail and the new file.");
			if (rotationTailPending) {
				await this.backfillFile(rotatedPath, stateOffset);
			}
			result = await this.backfillFile(this.logFile, 0);
		} else if (truncated || replaced) {
			logger.warn("Analytics log truncation or replacement detected; replaying the current file from its start.");
			result = await this.backfillFile(this.logFile, 0);
		} else {
			result = await this.backfillFile(this.logFile, stateOffset);
		}

		await this.saveIngestState({
			lastLineAt: this.lastLineAt,
			offset: result.offset,
			stat: this.statFile(this.logFile) || stat,
		});
		return result.offset;
	}

	async backfillFile(filePath, startOffset) {
		const stat = this.statFile(filePath);
		if (!stat) return { lines: 0, offset: startOffset };

		let position = Math.min(Math.max(0, startOffset), stat.size);
		const initialOffset = position;
		if (position >= stat.size) return { lines: 0, offset: initialOffset };

		const decoder = new StringDecoder("utf8");
		const buffer = Buffer.alloc(BACKFILL_CHUNK_SIZE);
		let pending = "";
		let committedOffset = position;
		let lines = 0;
		const descriptor = fs.openSync(filePath, "r");

		try {
			while (position < stat.size) {
				const length = Math.min(BACKFILL_CHUNK_SIZE, stat.size - position);
				const read = fs.readSync(descriptor, buffer, 0, length, position);
				if (read <= 0) break;
				position += read;
				pending += decoder.write(buffer.subarray(0, read));

				let separator = pending.indexOf("\n");
				while (separator >= 0) {
					const line = pending.slice(0, separator);
					pending = pending.slice(separator + 1);
					committedOffset += Buffer.byteLength(line, "utf8") + 1;
					this.processLine(line);
					lines++;
					this.backfillLineCount++;
					if (
						this.detailedLogBuffer.length >= BACKFILL_FLUSH_THRESHOLD ||
						this.aggregationBuffer.size >= AGGREGATION_BUFFER_LIMIT / 2
					) {
						const flushed = await this.flush();
						if (!flushed) throw new errs.InternalError("Analytics backfill flush failed");
					}
					separator = pending.indexOf("\n");
				}
			}

			pending += decoder.end();
			const flushed = await this.flush();
			if (!flushed) throw new errs.InternalError("Analytics backfill flush failed");
			return { lines, offset: committedOffset };
		} finally {
			fs.closeSync(descriptor);
		}
	}

	getReadableOffset() {
		const tail = this.tail;
		if (tail && typeof tail.currentCursorPos === "number") {
			const buffered = typeof tail.buffer === "string" ? Buffer.byteLength(tail.buffer, "utf8") : 0;
			return Math.max(this.persistedOffset, tail.currentCursorPos - buffered);
		}
		return this.persistedOffset;
	}

	async persistOffset(offset) {
		if (!Number.isInteger(offset) || offset <= this.persistedOffset) return;
		const stat = this.statFile(this.logFile);
		if (!stat) return;
		try {
			await this.saveIngestState({ lastLineAt: this.lastLineAt, offset, stat });
		} catch (err) {
			// The batch is already durable; a lost offset only causes an idempotent replay.
			logger.error(`Failed to persist the analytics ingestion offset: ${err.message}`);
		}
	}

	async runRetention() {
		if (
			!Number.isInteger(DETAILED_RETENTION_HOURS) ||
			DETAILED_RETENTION_HOURS < 1 ||
			!Number.isInteger(AGGREGATION_RETENTION_DAYS) ||
			AGGREGATION_RETENTION_DAYS < 1
		) {
			logger.error("Refusing to run analytics retention with an invalid retention window.");
			return;
		}
		try {
			const detailedCutoff = dayjs().subtract(DETAILED_RETENTION_HOURS, "hour").toISOString();
			const aggregateCutoff = dayjs().subtract(AGGREGATION_RETENTION_DAYS, "day").toISOString();
			const [deletedDetailed, deletedAggregates] = await Promise.all([
				AnalyticsLogs.query().where("time", "<", detailedCutoff).delete(),
				AnalyticCount.query().where("timestamp", "<", aggregateCutoff).delete(),
			]);
			if (deletedDetailed > 0 || deletedAggregates > 0) {
				logger.info(
					`Analytics retention: removed ${deletedDetailed} detailed rows and ${deletedAggregates} aggregate rows.`,
				);
			}
		} catch (err) {
			logger.error(`Failed to run retention: ${err.message}`);
		}
	}
	/**
	 * Require analytics access or authorized ownership of a proxy host.
	 * @param {import("../lib/types.js").Access} access
	 * @param {number} hostId
	 */
	async assertHostAccess(access, hostId) {
		const host = await ProxyHost.query().where("id", hostId).andWhere("is_deleted", 0).first();
		if (!host) {
			throw new errs.ItemNotFoundError("Host not found");
		}

		let analyticsPermission = null;
		try {
			analyticsPermission = await access.can("analytics:list");
			const roles = analyticsPermission?.roles || [];
			if (roles.includes("admin") || analyticsPermission?.permission_visibility === "all") {
				return host;
			}
		} catch (err) {
			if (!(err instanceof errs.PermissionError)) throw err;
		}

		// A global "view" permission is not ownership: every account gets it by default.
		// Own-host analytics still requires a currently authorized proxy reader.
		const permission = await access.can("proxy_hosts:get", hostId);
		const userId = access?.token?.getUserId?.(0) || 0;
		if (
			!permission?.roles?.includes("admin") &&
			permission?.permission_visibility !== "all" &&
			host.owner_user_id !== userId
		) {
			throw new errs.PermissionError("You do not have permission to access analytics for this host.");
		}

		return host;
	}

	async getHostSummary(access, hostId, requestedRange) {
		await this.assertHostAccess(access, hostId);
		const now = dayjs();
		const { range, resolution, since } = resolveAnalyticsRange(requestedRange, now);
		const cacheKey = `${hostId}:${range}`;
		const cached = this.summaryCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) return cached.value;

		const sinceIso = since.toISOString();
		const untilIso = now.toISOString();
		const detailRetentionStart = now.subtract(DETAILED_RETENTION_HOURS, "hour");
		const detailSince = since.isBefore(detailRetentionStart) ? detailRetentionStart : since;
		const detailSinceIso = detailSince.toISOString();
		const detailComplete = !since.isBefore(detailRetentionStart);
		const knex = AnalyticsLogs.knex();

		// Parallel execution for speed
		const [topCountries, topIps, topReferers, topUserAgents, topPaths, recent, resultTotals] = await Promise.all([
			// Top Countries
			knex("analytics_logs")
				.select("country_code")
				.count("* as count")
				.where("host_id", hostId)
				.andWhere("time", ">=", detailSinceIso)
				.groupBy("country_code")
				.orderBy("count", "desc")
				.limit(10),

			// Top IPs
			knex("analytics_logs")
				.select("ip", "country_code")
				.count("* as count")
				.where("host_id", hostId)
				.andWhere("time", ">=", detailSinceIso)
				.groupBy("ip", "country_code")
				.orderBy("count", "desc")
				.limit(10),

			// Top Referrers
			knex("analytics_logs")
				.select("referer")
				.count("* as count")
				.where("host_id", hostId)
				.andWhere("time", ">=", detailSinceIso)
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
				.andWhere("time", ">=", detailSinceIso)
				.groupBy("user_agent")
				.orderBy("count", "desc")
				.limit(10),

			// Top Paths
			knex("analytics_logs")
				.select("path")
				.count("* as count")
				.where("host_id", hostId)
				.andWhere("time", ">=", detailSinceIso)
				.groupBy("path")
				.orderBy("count", "desc")
				.limit(10),

			// Recent 20 requests
			knex("analytics_logs")
				.select("*")
				.where("host_id", hostId)
				.andWhere("time", ">=", detailSinceIso)
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

		const summary = {
			range,
			since: sinceIso,
			stats: {
				count: getNum(totals, ["count", "COUNT", "request_count"]),
				status_2xx: getNum(totals, ["s2xx", "S2XX", "status_code_2xx"]),
				status_3xx: getNum(totals, ["s3xx", "S3XX", "status_code_3xx"]),
				status_4xx: getNum(totals, ["s4xx", "S4XX", "status_code_4xx"]),
				status_5xx: getNum(totals, ["s5xx", "S5XX", "status_code_5xx"]),
			},
			kpi_window: {
				range,
				resolution,
				since: sinceIso,
				source: "aggregates",
				until: untilIso,
			},
			detail_window: {
				complete: detailComplete,
				range,
				retention_hours: DETAILED_RETENTION_HOURS,
				since: detailSinceIso,
				source: "details",
				until: untilIso,
			},
			top_countries: topCountries,
			top_ips: topIps,
			top_referers: topReferers,
			top_user_agents: topUserAgents,
			top_paths: topPaths,
			recent_requests: recent,
		};
		this.summaryCache.set(cacheKey, { expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS, value: summary });
		return summary;
	}
}

const service = new AnalyticsService();
export default service;
