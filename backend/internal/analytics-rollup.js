import { resolveRetentionConfig, resolveRollupLateWindow } from "../lib/analytics-retention.js";
import {
	bucketKeyFor,
	floorToHourMs,
	HOUR_MS,
	hourBucketEndIso,
	isoFromMs,
	resolveRollupBuckets,
	toTimestampMs,
} from "../lib/analytics-rollup.js";
import { analytics as logger } from "../logger.js";
import AnalyticsHourly from "../models/analytics_hourly.js";

const ROLLUP_NAME = "hourly";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_GRACE_MS = 2 * 60 * 1000;
const DEFAULT_LATE_WINDOW_HOURS = 3;
const DEFAULT_MAX_BUCKETS = 72;
const LATE_ROW_OVERLAP_MS = 15 * 60 * 1000;

const resolveKnex = (model) => {
	try {
		if (!model || typeof model.knex !== "function") return null;
		return model.knex() || null;
	} catch {
		return null;
	}
};

const counter = (value) => {
	const number = Number(value);
	return Number.isFinite(number) ? Math.trunc(number) : 0;
};

/**
 * Aggregate completed hours of raw analytics rows into the hourly table.
 *
 * Writes use "set" semantics: every processed hour replaces the counters for that hour instead of
 * adding to them. The committed watermark in `analytics_rollup_state` makes retries, restarts and
 * late-row recomputations converge on the same totals and never double count.
 */
export class AnalyticsRollupService {
	constructor(options = {}) {
		const retention = resolveRetentionConfig();
		this.name = options.name || ROLLUP_NAME;
		this.intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
		this.graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
		this.detailedRetentionHours = Number.isInteger(options.detailedRetentionHours)
			? options.detailedRetentionHours
			: retention.detailedHours;
		this.lateWindowHours = resolveRollupLateWindow({
			detailedHours: this.detailedRetentionHours,
			lateWindowHours: options.lateWindowHours ?? DEFAULT_LATE_WINDOW_HOURS,
		});
		this.maxBuckets = options.maxBuckets || DEFAULT_MAX_BUCKETS;
		this.hourlyModel = options.hourlyModel || AnalyticsHourly;
		this.interval = null;
		this.initPromise = null;
		this.runPromise = null;
		this.isInitialized = false;
		this.coverageStart = null;
		this.watermark = null;
		this.coveredThrough = null;
		this.lastRunAt = null;
		this.lastBucketCount = 0;
		this.lastError = null;
	}

	getStatus() {
		return {
			coverageStart: this.coverageStart,
			coveredThrough: this.coveredThrough,
			detailedRetentionHours: this.detailedRetentionHours,
			intervalMs: this.intervalMs,
			lastBucketCount: this.lastBucketCount,
			lastError: this.lastError,
			lastRunAt: this.lastRunAt,
			lateWindowHours: this.lateWindowHours,
			queryCoveredFrom: this.getQueryCoveredFrom(),
			queryCoveredThrough: this.getQueryCoveredThrough(),
			watermark: this.watermark,
		};
	}

	/** First bucket covered by the hourly rollup. */
	getQueryCoveredFrom() {
		return this.coverageStart;
	}

	/** Exclusive end of the committed hourly coverage. */
	getCoveredThrough() {
		return this.coveredThrough;
	}

	/**
	 * Exclusive end of the coverage that will no longer be recomputed for late rows. Long-range
	 * queries use this boundary so a late correction can never be counted twice.
	 */
	getQueryCoveredThrough() {
		if (!this.coverageStart) return null;
		const coveredMs = toTimestampMs(this.coveredThrough);
		if (!Number.isFinite(coveredMs)) return null;
		const stableMs = coveredMs - this.lateWindowHours * HOUR_MS;
		return stableMs > 0 ? isoFromMs(stableMs) : null;
	}

	async init() {
		if (this.isInitialized) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.start();
		try {
			await this.initPromise;
		} finally {
			this.initPromise = null;
		}
	}

	async start() {
		await this.loadState();
		this.interval = setInterval(() => {
			void this.runOnce();
		}, this.intervalMs);
		this.isInitialized = true;
		// Do not block startup on a large backlog; the first run continues in the background.
		void this.runOnce();
	}

	async stop() {
		clearInterval(this.interval);
		this.interval = null;
		this.isInitialized = false;
		await this.runPromise;
	}

	async knex() {
		return resolveKnex(this.hourlyModel);
	}

	async loadState() {
		const db = await this.knex();
		if (!db) return;
		try {
			const row = await db("analytics_rollup_state").where("name", this.name).first();
			this.coverageStart = row?.coverage_start || null;
			this.watermark = row?.watermark || null;
			this.lastRunAt =
				row?.last_run_at === undefined || row?.last_run_at === null ? null : Number(row.last_run_at);
			this.coveredThrough = this.watermark ? isoFromMs(floorToHourMs(this.watermark) + HOUR_MS) : null;
		} catch (error) {
			// The table may not exist before the migration runs; the first regular run retries.
			logger.error(`Analytics rollup state could not be loaded: ${error.message}`);
		}
	}

	async runOnce({ now = new Date() } = {}) {
		if (this.runPromise) {
			await this.runPromise;
			return this.lastRunAt;
		}

		this.runPromise = this.execute(now);
		try {
			await this.runPromise;
		} finally {
			this.runPromise = null;
		}
		return this.lastRunAt;
	}

	async execute(now) {
		const db = await this.knex();
		if (!db) {
			this.lastError = "Analytics database is not available";
			return;
		}

		const nowMs = toTimestampMs(now);
		if (!Number.isFinite(nowMs)) {
			this.lastError = "Invalid rollup timestamp";
			return;
		}

		try {
			const earliestRaw = await this.findEarliestRaw(db);
			const plan = resolveRollupBuckets({
				earliestRaw,
				graceMs: this.graceMs,
				lateWindowHours: this.lateWindowHours,
				maxBuckets: this.maxBuckets,
				now: nowMs,
				recomputeLate: await this.hasLateRows(db),
				watermark: this.watermark,
			});

			if (plan.skippedBefore) {
				logger.warn(
					`Analytics rollup skipped hours before ${plan.skippedBefore}; their raw detail rows are no longer available.`,
				);
			}

			// Raw detail outlives a hard-deleted host. Attribute such rows to the global bucket
			// instead of failing the whole hour on the hourly table's foreign key.
			const knownHostIds = await this.loadKnownHostIds(db);
			for (const bucketStart of plan.buckets) {
				await this.rollupBucket(db, bucketStart, nowMs, knownHostIds);
				this.watermark = this.watermark && this.watermark > bucketStart ? this.watermark : bucketStart;
				this.coveredThrough = isoFromMs(floorToHourMs(this.watermark) + HOUR_MS);
			}

			this.lastBucketCount = plan.buckets.length;
			this.lastRunAt = nowMs;
			this.lastError = null;
		} catch (error) {
			this.lastError = error.message;
			logger.error(`Analytics hourly rollup failed: ${error.message}`);
		}
	}

	async findEarliestRaw(db) {
		const row = await db("analytics_logs").select("time").whereNotNull("time").orderBy("time", "asc").first();
		return row?.time || null;
	}

	async loadKnownHostIds(db) {
		const rows = await db("proxy_host").select("id");
		return new Set(rows.map((row) => counter(row.id)).filter((id) => id > 0));
	}

	/**
	 * True when detail rows arrived after the previous run, which means a committed hour may have
	 * changed and has to be recomputed. Without late rows the job only aggregates new hours.
	 */
	async hasLateRows(db) {
		if (this.lastRunAt === null) return true;
		const query = db("analytics_logs")
			.select("id")
			.where("created_at", ">=", this.lastRunAt - LATE_ROW_OVERLAP_MS)
			.limit(1);
		// Rows for the current, not yet rolled-up hour do not require a committed bucket to change.
		if (this.coveredThrough) query.andWhere("time", "<", this.coveredThrough);
		const row = await query.first();
		return Boolean(row);
	}

	async aggregateBucket(db, bucketStart, nowMs, knownHostIds) {
		const bucketEnd = hourBucketEndIso(bucketStart);
		if (!bucketEnd) return [];

		const rows = await db("analytics_logs")
			.select("host_id")
			.count("* as request_count")
			.sum("bytes as bytes_sent")
			.select(
				db.raw(
					"coalesce(sum(case when status >= 200 and status < 300 then 1 else 0 end), 0) as status_code_2xx",
				),
				db.raw(
					"coalesce(sum(case when status >= 300 and status < 400 then 1 else 0 end), 0) as status_code_3xx",
				),
				db.raw(
					"coalesce(sum(case when status >= 400 and status < 500 then 1 else 0 end), 0) as status_code_4xx",
				),
				db.raw("coalesce(sum(case when status >= 500 then 1 else 0 end), 0) as status_code_5xx"),
				db.raw("coalesce(sum(case when duration > 0 then duration else 0 end), 0) as duration_sum"),
				db.raw("coalesce(sum(case when duration > 0 then 1 else 0 end), 0) as duration_count"),
			)
			.where("time", ">=", bucketStart)
			.andWhere("time", "<", bucketEnd)
			.groupBy("host_id");

		return rows.map((row) => {
			const rawHostId = counter(row.host_id);
			const hostId = knownHostIds?.has(rawHostId) ? rawHostId : 0;
			return {
				proxy_host_id: hostId > 0 ? hostId : null,
				bucket_key: bucketKeyFor(hostId),
				bucket_start: bucketStart,
				request_count: counter(row.request_count),
				bytes_sent: counter(row.bytes_sent),
				status_code_2xx: counter(row.status_code_2xx),
				status_code_3xx: counter(row.status_code_3xx),
				status_code_4xx: counter(row.status_code_4xx),
				status_code_5xx: counter(row.status_code_5xx),
				duration_sum: counter(row.duration_sum),
				duration_count: counter(row.duration_count),
				rolled_up_at: nowMs,
			};
		});
	}

	async rollupBucket(db, bucketStart, nowMs, knownHostIds) {
		const rows = await this.aggregateBucket(db, bucketStart, nowMs, knownHostIds);
		const nextWatermark = this.watermark && this.watermark > bucketStart ? this.watermark : bucketStart;
		const nextCoverageStart =
			this.coverageStart && this.coverageStart < bucketStart ? this.coverageStart : bucketStart;

		await db.transaction(async (trx) => {
			if (rows.length > 0) {
				// Replace the counters for this hour. Re-running the same bucket must not add them again.
				await trx("analytics_hourly").insert(rows).onConflict(["bucket_key", "bucket_start"]).merge();
			}

			const stale = trx("analytics_hourly").where("bucket_start", bucketStart);
			if (rows.length > 0) {
				stale.whereNotIn(
					"bucket_key",
					rows.map((row) => row.bucket_key),
				);
			}
			await stale.delete();

			const state = {
				coverage_start: nextCoverageStart,
				last_run_at: nowMs,
				name: this.name,
				updated_at: nowMs,
				watermark: nextWatermark,
			};
			await trx("analytics_rollup_state").insert(state).onConflict("name").merge();
		});

		this.coverageStart = nextCoverageStart;
	}
}

const service = new AnalyticsRollupService();
export default service;
