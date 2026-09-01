import crypto from "node:crypto";
import fs from "node:fs";
import dayjs from "dayjs";
import { Tail } from "tail";
import { DurableAnalyticsSpool } from "../lib/analytics-spool.js";
import errs from "../lib/error.js";
import { analytics as logger } from "../logger.js";
import AnalyticCount from "../models/analytic_count.js";
import AnalyticsLogs from "../models/analytics_logs.js";
import ProxyHost from "../models/proxy_host.js";

const DATA_PATH = process.env.DATA_PATH || "/data";
const LOG_FILE = `${DATA_PATH}/nginx/json_access.log`;
const DEFAULT_SPOOL_PATH = `${DATA_PATH}/shieldpm/analytics-spool.ndjson`;
const FLUSH_INTERVAL_MS = 10 * 1000;
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
const DOMAIN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const RETENTION_HOURS = 24;
const INSERT_CHUNK_SIZE = 250;
const DEFAULT_BATCH_RECORDS = 250;
const MAX_QUERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_REQUEST_METHOD_LENGTH = 255;
const REJECTION_LOG_INTERVAL_MS = 60 * 1000;
const LEDGER_TABLE = "analytics_ingestion_batch";
const ISO_TIMESTAMP_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const RANGE_DURATIONS = new Map([
	["1h", 60 * 60 * 1000],
	["24h", 24 * 60 * 60 * 1000],
	["7d", 7 * 24 * 60 * 60 * 1000],
	["30d", 30 * 24 * 60 * 60 * 1000],
]);

const aggregationKeyFor = (hostId) => (hostId === 0 ? "global" : `host:${hostId}`);

const parsePositiveInteger = (value, name, fallback) => {
	if (value === undefined || value === null || value === "") return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive safe integer`);
	}
	return parsed;
};

const parseNonNegativeInteger = (value, fallback = 0) => {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const parseRequestMethod = (value) => {
	if (typeof value !== "string") return null;
	if (value.length > MAX_REQUEST_METHOD_LENGTH) {
		throw new errs.ValidationError(`request_method must not exceed ${MAX_REQUEST_METHOD_LENGTH} characters`);
	}
	return value;
};

/**
 * Parse a real RFC 3339/ISO 8601 timestamp without accepting JavaScript's date rollover.
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {Date}
 */
export const parseStrictIsoTimestamp = (value, fieldName = "timestamp") => {
	if (typeof value !== "string") {
		throw new errs.ValidationError(`${fieldName} must be an ISO 8601 timestamp`);
	}
	const match = ISO_TIMESTAMP_PATTERN.exec(value);
	if (!match) {
		throw new errs.ValidationError(`${fieldName} must be a complete ISO 8601 timestamp with a timezone`);
	}

	const [
		,
		yearText,
		monthText,
		dayText,
		hourText,
		minuteText,
		secondText,
		,
		zone,
		,
		offsetHourText,
		offsetMinuteText,
	] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const second = Number(secondText);
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const offsetHour = zone === "Z" ? 0 : Number(offsetHourText);
	const offsetMinute = zone === "Z" ? 0 : Number(offsetMinuteText);

	if (
		year < 1 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > daysInMonth ||
		hour > 23 ||
		minute > 59 ||
		second > 59 ||
		offsetHour > 14 ||
		offsetMinute > 59 ||
		(offsetHour === 14 && offsetMinute !== 0)
	) {
		throw new errs.ValidationError(`${fieldName} is not a real ISO 8601 timestamp`);
	}

	const timestamp = new Date(value);
	if (!Number.isFinite(timestamp.getTime())) {
		throw new errs.ValidationError(`${fieldName} is not a real ISO 8601 timestamp`);
	}
	return timestamp;
};

/**
 * Validate and normalize an analytics API time window.
 *
 * @param {{start?: unknown, end?: unknown}} input
 * @param {Date} [now]
 * @returns {{start: string, end: string}}
 */
export const parseAnalyticsWindow = (input, now = new Date()) => {
	const endDate = input.end === undefined ? new Date(now) : parseStrictIsoTimestamp(input.end, "end");
	const startDate =
		input.start === undefined
			? new Date(endDate.getTime() - 24 * 60 * 60 * 1000)
			: parseStrictIsoTimestamp(input.start, "start");

	if (endDate.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) {
		throw new errs.ValidationError("end exceeds the permitted future clock skew");
	}
	if (startDate.getTime() >= endDate.getTime()) {
		throw new errs.ValidationError("start must be earlier than end");
	}
	if (endDate.getTime() - startDate.getTime() > MAX_QUERY_WINDOW_MS) {
		throw new errs.ValidationError("analytics time windows must not exceed 30 days");
	}

	return { start: startDate.toISOString(), end: endDate.toISOString() };
};

/**
 * @param {unknown} range
 * @param {Date} [now]
 * @returns {{range: string, start: string, end: string}}
 */
export const parseAnalyticsRange = (range, now = new Date()) => {
	const normalizedRange = range === undefined ? "24h" : range;
	if (typeof normalizedRange !== "string" || !RANGE_DURATIONS.has(normalizedRange)) {
		throw new errs.ValidationError("range must be one of 1h, 24h, 7d, or 30d");
	}
	return {
		range: normalizedRange,
		start: new Date(now.getTime() - RANGE_DURATIONS.get(normalizedRange)).toISOString(),
		end: now.toISOString(),
	};
};

/**
 * @param {*} access
 * @returns {Promise<{unrestricted: boolean, userId: number}>}
 */
export const getAnalyticsAccessScope = async (access) => {
	const permission = await access.can("analytics:list");
	return {
		unrestricted: permission === true || permission?.permission_visibility === "all",
		userId: Number(access?.token?.getUserId?.(1)) || 0,
	};
};

const normalizeHostname = (value) => {
	if (typeof value !== "string") return "";
	const trimmed = value.trim().toLowerCase().replace(/\.$/, "");
	if (trimmed.startsWith("[")) {
		const closingBracket = trimmed.indexOf("]");
		return closingBracket === -1 ? trimmed : trimmed.slice(0, closingBracket + 1);
	}
	return trimmed.replace(/:\d+$/, "");
};

export class AnalyticsService {
	/**
	 * @param {string} [logFile]
	 * @param {{spool?: DurableAnalyticsSpool, spoolPath?: string, spoolMaxBytes?: number, recordMaxBytes?: number, batchRecords?: number, now?: () => Date}} [options]
	 */
	constructor(logFile, options = {}) {
		this.logFile = logFile || LOG_FILE;
		this.tail = null;
		this.hostCache = new Map();
		this.flushTimer = null;
		this.retentionTimer = null;
		this.domainRefreshTimer = null;
		this.flushPromise = null;
		this.initializationPromise = null;
		this.stopPromise = null;
		this.isInitialized = false;
		this.accepting = false;
		this.lastRejectionLogAt = 0;
		this.now = options.now || (() => new Date());
		this.batchRecords = parsePositiveInteger(
			options.batchRecords ?? process.env.ANALYTICS_SPOOL_BATCH_RECORDS,
			"ANALYTICS_SPOOL_BATCH_RECORDS",
			DEFAULT_BATCH_RECORDS,
		);
		this.spool =
			options.spool ||
			new DurableAnalyticsSpool(options.spoolPath || process.env.ANALYTICS_SPOOL_PATH || DEFAULT_SPOOL_PATH, {
				maxBytes: options.spoolMaxBytes ?? process.env.ANALYTICS_SPOOL_MAX_BYTES,
				recordMaxBytes: options.recordMaxBytes ?? process.env.ANALYTICS_SPOOL_RECORD_MAX_BYTES,
			});
	}

	async init() {
		if (this.isInitialized) return true;
		if (this.initializationPromise) return this.initializationPromise;

		this.initializationPromise = this.initialize();
		try {
			this.isInitialized = await this.initializationPromise;
			return this.isInitialized;
		} finally {
			this.initializationPromise = null;
		}
	}

	async initialize() {
		try {
			fs.closeSync(fs.openSync(this.logFile, "wx", 0o600));
		} catch (err) {
			if (err.code !== "EEXIST") {
				logger.error(`Could not create analytics log file: ${err.message}`);
				return false;
			}
		}

		try {
			this.spool.open();
		} catch (err) {
			logger.error(`Could not open the durable analytics spool: ${err.message}`);
			return false;
		}

		logger.info(`Starting Analytics Service, watching ${this.logFile}...`);
		await this.loadDomains();

		try {
			const compacted = this.spool.compact(true);
			if (compacted) await this.cleanupLedger();
			await this.drainSpool();
		} catch (err) {
			logger.error(`Analytics startup replay is pending because the database is unavailable: ${err.message}`);
		}

		try {
			this.tail = new Tail(this.logFile);
			this.accepting = true;
			this.tail.on("line", (line) => this.processLine(line));
			this.tail.on("error", (error) => logger.error(`Tail error: ${error}`));
		} catch (err) {
			this.accepting = false;
			this.spool.close();
			logger.error(`Failed to initialize analytics tail: ${err.message}`);
			return false;
		}

		this.domainRefreshTimer = setInterval(() => void this.loadDomains(), DOMAIN_REFRESH_INTERVAL_MS);
		this.flushTimer = setInterval(() => {
			void this.flush().catch((err) => logger.error(`Failed to flush analytics spool: ${err.message}`));
		}, FLUSH_INTERVAL_MS);
		this.retentionTimer = setInterval(() => void this.runRetention(), RETENTION_INTERVAL_MS);
		void this.runRetention();
		return true;
	}

	async loadDomains() {
		try {
			const hosts = await ProxyHost.query().where("is_deleted", 0).select("id", "domain_names");
			const newMap = new Map();
			for (const host of hosts) {
				if (Array.isArray(host.domain_names)) {
					for (const domain of host.domain_names) {
						const hostname = normalizeHostname(domain);
						if (hostname) newMap.set(hostname, host.id);
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
		if (!this.accepting) return false;
		try {
			if (typeof line !== "string" || !line.trim()) return false;
			const fixedLine = line.replace(/"geoip_country_code":([A-Z]{2})}/g, '"geoip_country_code":"$1"}');
			const data = JSON.parse(fixedLine);
			const time = parseStrictIsoTimestamp(data.time_iso8601, "time_iso8601");
			if (time.getTime() > this.now().getTime() + MAX_FUTURE_SKEW_MS) {
				throw new errs.ValidationError("time_iso8601 exceeds the permitted future clock skew");
			}

			let hostname = normalizeHostname(data.server_name);
			if (!hostname || hostname === "_") hostname = normalizeHostname(data.http_host);
			const hostId = this.hostCache.get(hostname) || 0;
			const requestTime = Number.parseFloat(data.request_time);
			const event = {
				host_id: hostId,
				time: time.toISOString(),
				method: parseRequestMethod(data.request_method),
				path: typeof data.request_uri === "string" ? data.request_uri : null,
				status: parseNonNegativeInteger(data.status),
				bytes: parseNonNegativeInteger(data.body_bytes_sent),
				ip: typeof data.remote_addr === "string" ? data.remote_addr : null,
				country_code: typeof data.geoip_country_code === "string" ? data.geoip_country_code : null,
				referer: typeof data.http_referer === "string" ? data.http_referer : null,
				user_agent: typeof data.http_user_agent === "string" ? data.http_user_agent : null,
				duration: Number.isFinite(requestTime) && requestTime > 0 ? Math.floor(requestTime * 1000) : 0,
			};
			this.spool.append(event);
			this.applyBackpressure();
			return true;
		} catch (err) {
			this.logRejectedAnalyticsLine(err);
			return false;
		}
	}

	logRejectedAnalyticsLine(err) {
		const now = Date.now();
		if (now - this.lastRejectionLogAt < REJECTION_LOG_INTERVAL_MS) return;
		this.lastRejectionLogAt = now;
		logger.error(`Rejected analytics input before ingestion: ${err.message}`);
	}

	applyBackpressure() {
		if (this.spool.pendingCount >= this.batchRecords) {
			void this.flush().catch((err) => logger.error(`Failed to flush analytics spool: ${err.message}`));
		}
	}

	chunkArray(items, chunkSize) {
		const chunks = [];
		for (let index = 0; index < items.length; index += chunkSize) {
			chunks.push(items.slice(index, index + chunkSize));
		}
		return chunks;
	}

	async flushDetailedLogs(batch, transaction) {
		if (batch.length === 0) return;
		const database = transaction || AnalyticsLogs.knex();
		const tableName = AnalyticsLogs.tableName || "analytics_logs";
		for (const chunk of this.chunkArray(batch, INSERT_CHUNK_SIZE)) {
			await database.table(tableName).insert(chunk);
		}
	}

	async flushAggregations(entries, transaction) {
		if (entries.length === 0) return;
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

		const insertRows = async (trx) => {
			for (const chunk of this.chunkArray(rows, INSERT_CHUNK_SIZE)) {
				for (const row of chunk) {
					await AnalyticCount.query(trx)
						.insert(row)
						.onConflict(["aggregation_key", "aggregation_timestamp", "aggregation_generation"])
						.merge({
							status_code_2xx: trx.raw("coalesce(analytic_count.status_code_2xx, 0) + ?", [
								row.status_code_2xx,
							]),
							status_code_3xx: trx.raw("coalesce(analytic_count.status_code_3xx, 0) + ?", [
								row.status_code_3xx,
							]),
							status_code_4xx: trx.raw("coalesce(analytic_count.status_code_4xx, 0) + ?", [
								row.status_code_4xx,
							]),
							status_code_5xx: trx.raw("coalesce(analytic_count.status_code_5xx, 0) + ?", [
								row.status_code_5xx,
							]),
							bytes_sent: trx.raw("coalesce(analytic_count.bytes_sent, 0) + ?", [row.bytes_sent]),
							request_count: trx.raw("coalesce(analytic_count.request_count, 0) + ?", [
								row.request_count,
							]),
						});
				}
			}
		};

		if (transaction) await insertRows(transaction);
		else await AnalyticCount.transaction(insertRows);
	}

	buildBatch(records) {
		// Persist the ingestion timestamp explicitly so upgraded installations do not
		// depend on the legacy, dialect-specific analytics_logs column default.
		const createdAt = this.now().getTime();
		const detailedLogs = records.map((record) => ({ ...record.event, created_at: createdAt }));
		const aggregations = new Map();
		for (const event of detailedLogs) {
			const timestamp = dayjs(event.time).startOf("minute").toISOString();
			const key = `${event.host_id}|${timestamp}`;
			if (!aggregations.has(key)) {
				aggregations.set(key, {
					host_id: event.host_id,
					timestamp,
					count: 0,
					bytes: 0,
					status_2xx: 0,
					status_3xx: 0,
					status_4xx: 0,
					status_5xx: 0,
				});
			}
			const aggregate = aggregations.get(key);
			aggregate.count++;
			aggregate.bytes += event.bytes;
			if (event.status >= 200 && event.status < 300) aggregate.status_2xx++;
			else if (event.status >= 300 && event.status < 400) aggregate.status_3xx++;
			else if (event.status >= 400 && event.status < 500) aggregate.status_4xx++;
			else if (event.status >= 500 && event.status < 600) aggregate.status_5xx++;
		}

		const firstSequence = records[0].sequence;
		const lastSequence = records.at(-1).sequence;
		const payloadHash = crypto
			.createHash("sha256")
			.update(Buffer.concat(records.map((record) => record.serialized)))
			.digest("hex");
		const batchId = crypto
			.createHash("sha256")
			.update(`analytics:v1:${firstSequence}:${lastSequence}:${payloadHash}`)
			.digest("hex");
		return {
			batchId,
			payloadHash,
			firstSequence,
			lastSequence,
			recordCount: records.length,
			detailedLogs,
			aggregations: Array.from(aggregations.values()),
		};
	}

	validateLedgerRow(existing, batch) {
		if (
			existing.status !== "committed" ||
			existing.payload_hash !== batch.payloadHash ||
			Number(existing.record_count) !== batch.recordCount ||
			Number(existing.first_sequence) !== batch.firstSequence ||
			Number(existing.last_sequence) !== batch.lastSequence
		) {
			throw new Error(`Analytics ingestion ledger conflict for batch ${batch.batchId}`);
		}
	}

	async commitBatch(batch) {
		const knex = AnalyticsLogs.knex();
		return knex.transaction(async (trx) => {
			const existing = await trx(LEDGER_TABLE).where("batch_id", batch.batchId).first();
			if (existing) {
				this.validateLedgerRow(existing, batch);
				return false;
			}

			const now = this.now().toISOString();
			const claimToken = crypto.randomBytes(32).toString("hex");
			await trx(LEDGER_TABLE).insert({
				batch_id: batch.batchId,
				payload_hash: batch.payloadHash,
				claim_token: claimToken,
				record_count: batch.recordCount,
				first_sequence: batch.firstSequence,
				last_sequence: batch.lastSequence,
				status: "claimed",
				created_at: now,
				committed_at: null,
			});
			await this.flushDetailedLogs(batch.detailedLogs, trx);
			await this.flushAggregations(batch.aggregations, trx);
			const updated = await trx(LEDGER_TABLE)
				.where({ batch_id: batch.batchId, claim_token: claimToken, status: "claimed" })
				.update({ status: "committed", committed_at: this.now().toISOString() });
			if (updated !== 1) throw new Error(`Analytics ingestion claim was lost for batch ${batch.batchId}`);
			return true;
		});
	}

	async flush() {
		if (this.flushPromise) return this.flushPromise;
		this.flushPromise = this.flushOnce();
		try {
			return await this.flushPromise;
		} finally {
			this.flushPromise = null;
		}
	}

	async flushOnce() {
		const records = this.spool.peek(this.batchRecords);
		if (records.length === 0) return false;

		const batch = this.buildBatch(records);
		await this.commitBatch(batch);
		this.spool.markCommitted(batch.lastSequence);

		let compacted = false;
		try {
			compacted = this.spool.compact(true);
		} catch (err) {
			logger.error(`Analytics spool compaction failed; ledger entries are retained: ${err.message}`);
		}
		if (compacted) {
			try {
				await this.cleanupLedger();
			} catch (err) {
				logger.error(`Analytics ingestion ledger cleanup failed: ${err.message}`);
			}
		}
		return true;
	}

	async drainSpool() {
		while (this.spool.pendingCount > 0) await this.flush();
	}

	async cleanupLedger() {
		const replayFloor = this.spool.getReplayFloor();
		return AnalyticsLogs.knex()(LEDGER_TABLE)
			.where("status", "committed")
			.andWhere("last_sequence", "<", replayFloor)
			.delete();
	}

	async runRetention() {
		try {
			const cutoff = dayjs().subtract(RETENTION_HOURS, "hour").toISOString();
			const deleted = await AnalyticsLogs.query().where("time", "<", cutoff).delete();
			if (deleted > 0) logger.info(`Analytics Retention: Cleaned up ${deleted} old log entries.`);
		} catch (err) {
			logger.error(`Failed to run analytics retention: ${err.message}`);
		}
	}

	async stop() {
		if (this.stopPromise) return this.stopPromise;
		this.stopPromise = (async () => {
			this.accepting = false;
			for (const timer of [this.flushTimer, this.retentionTimer, this.domainRefreshTimer]) {
				if (timer) clearInterval(timer);
			}
			this.flushTimer = null;
			this.retentionTimer = null;
			this.domainRefreshTimer = null;
			if (this.tail?.unwatch) {
				try {
					await Promise.resolve(this.tail.unwatch());
				} catch (err) {
					logger.error(`Failed to stop the analytics tail cleanly: ${err.message}`);
				}
			}
			this.tail = null;
			try {
				await this.drainSpool();
				const compacted = this.spool.compact(true);
				if (compacted) await this.cleanupLedger();
			} finally {
				this.spool.close();
				this.isInitialized = false;
			}
		})();
		try {
			await this.stopPromise;
		} finally {
			this.stopPromise = null;
		}
	}

	/**
	 * Verify analytics permission and host ownership/visibility.
	 *
	 * @param {*} access
	 * @param {number} hostId
	 * @returns {Promise<ProxyHost>}
	 */
	async assertHostAccess(access, hostId) {
		if (!Number.isSafeInteger(hostId) || hostId <= 0) throw new errs.ItemNotFoundError("Host not found");
		const scope = await getAnalyticsAccessScope(access);
		const host = await ProxyHost.query().where("id", hostId).andWhere("is_deleted", 0).first();
		if (!host) throw new errs.ItemNotFoundError("Host not found");
		if (!scope.unrestricted && host.owner_user_id !== scope.userId) {
			throw new errs.PermissionError("You do not have permission to access analytics for this host.");
		}
		return host;
	}

	/**
	 * Get aggregated summary for a host.
	 *
	 * @param {*} access
	 * @param {number} hostId
	 * @param {unknown} range
	 * @returns {Promise<Object>}
	 */
	async getHostSummary(access, hostId, range) {
		await this.assertHostAccess(access, hostId);
		const window = parseAnalyticsRange(range, this.now());
		const knex = AnalyticsLogs.knex();
		const applyDetailedWindow = (query) =>
			query.where("host_id", hostId).andWhere("time", ">=", window.start).andWhere("time", "<=", window.end);

		const [topCountries, topIps, topReferers, topUserAgents, topPaths, recent, resultTotals] = await Promise.all([
			applyDetailedWindow(knex("analytics_logs").select("country_code"))
				.count("* as count")
				.groupBy("country_code")
				.orderBy("count", "desc")
				.limit(10),
			applyDetailedWindow(knex("analytics_logs").select("ip", "country_code"))
				.count("* as count")
				.groupBy("ip", "country_code")
				.orderBy("count", "desc")
				.limit(10),
			applyDetailedWindow(knex("analytics_logs").select("referer"))
				.count("* as count")
				.whereNotNull("referer")
				.andWhereNot("referer", "-")
				.groupBy("referer")
				.orderBy("count", "desc")
				.limit(10),
			applyDetailedWindow(knex("analytics_logs").select("user_agent"))
				.count("* as count")
				.groupBy("user_agent")
				.orderBy("count", "desc")
				.limit(10),
			applyDetailedWindow(knex("analytics_logs").select("path"))
				.count("* as count")
				.groupBy("path")
				.orderBy("count", "desc")
				.limit(10),
			applyDetailedWindow(knex("analytics_logs").select("*")).orderBy("time", "desc").limit(20),
			AnalyticCount.query()
				.where("proxy_host_id", hostId)
				.andWhere("timestamp", ">=", window.start)
				.andWhere("timestamp", "<=", window.end)
				.sum("request_count as count")
				.sum("status_code_2xx as s2xx")
				.sum("status_code_3xx as s3xx")
				.sum("status_code_4xx as s4xx")
				.sum("status_code_5xx as s5xx")
				.first(),
		]);

		const totals = resultTotals || {};
		const getNum = (obj, keys) => {
			for (const key of keys) {
				if (obj[key] !== undefined && obj[key] !== null) return Number(obj[key]);
			}
			return 0;
		};

		return {
			range: window.range,
			since: window.start,
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
