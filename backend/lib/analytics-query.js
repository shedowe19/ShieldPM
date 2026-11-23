import { ceilToHourMs, floorToHourMs, HOUR_MS, isoFromMs, toTimestampMs } from "./analytics-rollup.js";

const MINIMUM_HOURLY_SPAN_MS = 24 * HOUR_MS;

const number = (value) => Number(value) || 0;

const addCounters = (target, row) => {
	target.count += number(row.request_count);
	target.bytes += number(row.bytes_sent);
	target.s2xx += number(row.status_code_2xx);
	target.s3xx += number(row.status_code_3xx);
	target.s4xx += number(row.status_code_4xx);
	target.s5xx += number(row.status_code_5xx);
	return target;
};

const emptyCounters = () => ({ bytes: 0, count: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 });

/**
 * Split a requested time range into the part that can be answered from the hourly rollup and the
 * recent/partial edges that still need the minute aggregates. Only ranges longer than 24 hours are
 * eligible: the existing 24-hour contract keeps its minute resolution.
 *
 * @param {Object} options
 * @param {string} options.start
 * @param {string} options.end
 * @param {string|null} [options.coveredFrom] - First hour covered by the rollup.
 * @param {string|null} [options.coveredThrough] - Exclusive end of the query-safe rollup coverage.
 * @param {number} [options.minimumHourlySpanMs]
 * @returns {{ hourly: { fromIso: string, toIso: string, toInclusive: boolean } | null, minute: Array<{ fromIso: string, toIso: string, toInclusive: boolean }> }}
 */
export const planAnalyticsRange = ({
	start,
	end,
	coveredFrom = null,
	coveredThrough = null,
	minimumHourlySpanMs = MINIMUM_HOURLY_SPAN_MS,
}) => {
	const startMs = toTimestampMs(start);
	const endMs = toTimestampMs(end);
	const fallback = { hourly: null, minute: [{ fromIso: start, toIso: end, toInclusive: true }] };
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return fallback;
	if (endMs - startMs <= minimumHourlySpanMs) return fallback;

	const coverageStartMs = floorToHourMs(coveredFrom);
	const coverageEndMs = floorToHourMs(coveredThrough);
	if (!Number.isFinite(coverageEndMs)) return fallback;

	// Do not cut a requested range in the middle of an hour from the rollup. The partial first and
	// last hours keep using the minute aggregates, which still exist for the full API range.
	const hourlyFromMs = Math.max(ceilToHourMs(startMs), Number.isFinite(coverageStartMs) ? coverageStartMs : 0);
	const hourlyToMs = floorToHourMs(endMs);
	const hourlyCoveredToMs = Math.min(hourlyToMs, coverageEndMs);
	if (hourlyCoveredToMs <= hourlyFromMs) return fallback;

	const minute = [];
	if (startMs < hourlyFromMs) {
		minute.push({ fromIso: isoFromMs(startMs), toIso: isoFromMs(hourlyFromMs), toInclusive: false });
	}
	if (hourlyCoveredToMs <= endMs) {
		minute.push({ fromIso: isoFromMs(hourlyCoveredToMs), toIso: isoFromMs(endMs), toInclusive: true });
	}

	return {
		hourly: { fromIso: isoFromMs(hourlyFromMs), toIso: isoFromMs(hourlyCoveredToMs), toInclusive: false },
		minute,
	};
};

const applyWindow = (query, column, window) => {
	query.where(column, ">=", window.fromIso);
	if (window.toInclusive) query.andWhere(column, "<=", window.toIso);
	else query.andWhere(column, "<", window.toIso);
	return query;
};

const applyFilters = (
	query,
	{ applyScope = null, excludeUnattributed = false, hostId = null, onlyUnattributed = false },
) => {
	if (hostId !== null && hostId !== undefined) query.where("proxy_host_id", hostId);
	if (onlyUnattributed) query.whereNull("proxy_host_id");
	if (excludeUnattributed) query.whereNotNull("proxy_host_id");
	if (applyScope) applyScope(query);
	return query;
};

const windowsForPlan = (plan) => {
	const windows = [];
	if (plan.hourly) {
		windows.push({ table: "analytics_hourly", timeColumn: "bucket_start", window: plan.hourly });
	}
	for (const window of plan.minute) {
		windows.push({ table: "analytic_count", timeColumn: "timestamp", window });
	}
	return windows;
};

const windowIsEmpty = (window) => {
	const fromMs = toTimestampMs(window.fromIso);
	const toMs = toTimestampMs(window.toIso);
	if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return true;
	return window.toInclusive ? fromMs > toMs : fromMs >= toMs;
};

/**
 * Sum the same counters the analytics routes have always returned. Hourly and minute rows use
 * identical counter column names, so the only difference is the bucket column and the table.
 *
 * @param {import("knex").Knex} db
 * @param {ReturnType<typeof planAnalyticsRange>} plan
 * @param {{ applyScope?: ((query: any) => void) | null, excludeUnattributed?: boolean, hostId?: number|null, onlyUnattributed?: boolean }} [filters]
 * @returns {Promise<{ bytes: number, count: number, s2xx: number, s3xx: number, s4xx: number, s5xx: number }>}
 */
export const sumAnalyticsRange = async (db, plan, filters = {}) => {
	const windows = windowsForPlan(plan).filter(({ window }) => !windowIsEmpty(window));
	const rows = await Promise.all(
		windows.map(({ table, timeColumn, window }) => {
			const query = db(table)
				.sum("request_count as request_count")
				.sum("bytes_sent as bytes_sent")
				.sum("status_code_2xx as status_code_2xx")
				.sum("status_code_3xx as status_code_3xx")
				.sum("status_code_4xx as status_code_4xx")
				.sum("status_code_5xx as status_code_5xx")
				.first();
			applyWindow(query, timeColumn, window);
			applyFilters(query, filters);
			return query;
		}),
	);

	return rows.reduce((totals, row) => addCounters(totals, row || {}), emptyCounters());
};

/**
 * Load per-bucket rows for the global time series. Rows from both sources are returned with the
 * same column aliases; the caller downsamples them to the requested resolution.
 *
 * @param {import("knex").Knex} db
 * @param {ReturnType<typeof planAnalyticsRange>} plan
 * @param {{ applyScope?: ((query: any) => void) | null, excludeUnattributed?: boolean, hostId?: number|null }} [filters]
 * @returns {Promise<Array<Record<string, any>>>}
 */
export const loadAnalyticsSeries = async (db, plan, filters = {}) => {
	const windows = windowsForPlan(plan).filter(({ window }) => !windowIsEmpty(window));
	const parts = await Promise.all(
		windows.map(({ table, timeColumn, window }) => {
			const query = db(table)
				.select(`${timeColumn} as timestamp`)
				.sum("request_count as request_count")
				.sum("bytes_sent as bytes_sent")
				.sum("status_code_2xx as status_code_2xx")
				.sum("status_code_3xx as status_code_3xx")
				.sum("status_code_4xx as status_code_4xx")
				.sum("status_code_5xx as status_code_5xx")
				.groupBy(timeColumn)
				.orderBy(timeColumn, "asc");
			applyWindow(query, timeColumn, window);
			applyFilters(query, filters);
			return query;
		}),
	);
	return parts.flat();
};

/**
 * Sum the counters per proxy host so the top-host ranking can span hourly and minute buckets.
 *
 * @param {import("knex").Knex} db
 * @param {ReturnType<typeof planAnalyticsRange>} plan
 * @param {{ applyScope?: ((query: any) => void) | null, hostIds?: number[], excludeUnattributed?: boolean }} [filters]
 * @returns {Promise<Array<{ id: number, requests: number, bytes: number, client_errors: number, server_errors: number }>>}
 */
export const sumAnalyticsRangeByHost = async (db, plan, filters = {}) => {
	const { applyScope = null, hostIds = null, excludeUnattributed = false } = filters;
	const windows = windowsForPlan(plan).filter(({ window }) => !windowIsEmpty(window));
	const parts = await Promise.all(
		windows.map(({ table, timeColumn, window }) => {
			const query = db(table)
				.select("proxy_host_id")
				.sum("request_count as requests")
				.sum("bytes_sent as bytes")
				.sum("status_code_4xx as client_errors")
				.sum("status_code_5xx as server_errors")
				.groupBy("proxy_host_id");
			applyWindow(query, timeColumn, window);
			if (hostIds) query.whereIn("proxy_host_id", hostIds);
			if (excludeUnattributed) query.whereNotNull("proxy_host_id");
			if (applyScope) applyScope(query);
			return query;
		}),
	);

	const byHost = new Map();
	for (const row of parts.flat()) {
		const id = Number(row.proxy_host_id);
		if (!Number.isInteger(id) || id <= 0) continue;
		const current = byHost.get(id) || { bytes: 0, client_errors: 0, id, requests: 0, server_errors: 0 };
		current.requests += number(row.requests);
		current.bytes += number(row.bytes);
		current.client_errors += number(row.client_errors);
		current.server_errors += number(row.server_errors);
		byHost.set(id, current);
	}
	return [...byHost.values()];
};

/**
 * Resolution used by the global series endpoint once the rollup answers a long range.
 * @param {string} start
 * @param {string} end
 * @returns {"minute"|"hour"|"day"}
 */
export const resolveSeriesResolution = (start, end) => {
	const spanMs = toTimestampMs(end) - toTimestampMs(start);
	if (!Number.isFinite(spanMs) || spanMs <= 24 * HOUR_MS) return "minute";
	return spanMs <= 7 * 24 * HOUR_MS ? "hour" : "day";
};
