/**
 * Hour-bucket helpers shared by the hourly rollup job, the analytics retention and the
 * long-range query switch.
 *
 * Bucket boundaries are computed with plain epoch arithmetic so they stay aligned to UTC hour
 * boundaries regardless of the server time zone. Stored timestamps remain ISO-8601 UTC strings.
 */

export const HOUR_MS = 60 * 60 * 1000;
export const GLOBAL_BUCKET_KEY = "global";
const HOST_BUCKET_PREFIX = "host:";

/**
 * @param {any} value
 * @returns {number}
 */
export const toTimestampMs = (value) => {
	if (value === null || value === undefined) return Number.NaN;
	if (typeof value === "number") return value;
	if (value instanceof Date) return value.getTime();
	if (typeof value === "object" && typeof value.toISOString === "function") return Number(value.valueOf());
	return Date.parse(String(value));
};

/**
 * @param {number} ms
 * @returns {string}
 */
export const isoFromMs = (ms) => new Date(ms).toISOString();

/**
 * @param {any} value
 * @returns {number}
 */
export const floorToHourMs = (value) => {
	const ms = toTimestampMs(value);
	return Number.isFinite(ms) ? Math.floor(ms / HOUR_MS) * HOUR_MS : Number.NaN;
};

/**
 * @param {any} value
 * @returns {number}
 */
export const ceilToHourMs = (value) => {
	const ms = toTimestampMs(value);
	return Number.isFinite(ms) ? Math.ceil(ms / HOUR_MS) * HOUR_MS : Number.NaN;
};

/**
 * @param {any} value
 * @returns {string|null}
 */
export const hourBucketStartIso = (value) => {
	const ms = floorToHourMs(value);
	return Number.isFinite(ms) ? isoFromMs(ms) : null;
};

/**
 * Exclusive end of an hour bucket.
 * @param {string} bucketStart
 * @returns {string|null}
 */
export const hourBucketEndIso = (bucketStart) => {
	const ms = toTimestampMs(bucketStart);
	return Number.isFinite(ms) ? isoFromMs(ms + HOUR_MS) : null;
};

/**
 * Stable key for the hourly table. A nullable host column cannot be part of a portable unique
 * constraint, so the key carries the global/host distinction and stays unique across dialects.
 * @param {number|null|undefined} hostId
 * @returns {string}
 */
export const bucketKeyFor = (hostId) => {
	const id = Number(hostId);
	return !Number.isFinite(id) || id === 0 ? GLOBAL_BUCKET_KEY : `${HOST_BUCKET_PREFIX}${id}`;
};

/**
 * @param {string} bucketKey
 * @returns {number|null}
 */
export const proxyHostIdFromBucketKey = (bucketKey) => {
	if (typeof bucketKey !== "string" || !bucketKey.startsWith(HOST_BUCKET_PREFIX)) return null;
	const id = Number(bucketKey.slice(HOST_BUCKET_PREFIX.length));
	return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * Decide which completed hours the rollup still has to (re)compute.
 *
 * The watermark is the last bucket that was committed. A small window before it is recomputed so
 * late rows that arrive after the first rollup are picked up. Buckets before the earliest raw
 * detail row are skipped because their source rows are no longer available; the watermark then
 * jumps over that gap without deleting existing rollups.
 *
 * @param {Object} options
 * @param {any} options.now
 * @param {string|null} [options.watermark]
 * @param {string|null} [options.earliestRaw]
 * @param {number} [options.lateWindowHours]
 * @param {boolean} [options.recomputeLate]
 * @param {number} [options.maxBuckets]
 * @param {number} [options.graceMs]
 * @returns {{ buckets: string[], latestEligible: string|null, nextWatermark: string|null, skippedBefore: string|null }}
 */
export const resolveRollupBuckets = ({
	now,
	watermark = null,
	earliestRaw = null,
	lateWindowHours = 3,
	maxBuckets = 72,
	graceMs = 0,
	recomputeLate = true,
}) => {
	const nowMs = toTimestampMs(now);
	if (!Number.isFinite(nowMs)) {
		return { buckets: [], latestEligible: null, nextWatermark: null, skippedBefore: null };
	}

	const safeLateWindow = Math.max(0, Math.floor(Number(lateWindowHours) || 0));
	const safeMaxBuckets = Math.max(1, Math.floor(Number(maxBuckets) || 1));
	const latestEligibleMs = floorToHourMs(nowMs - Math.max(0, Number(graceMs) || 0)) - HOUR_MS;
	if (!Number.isFinite(latestEligibleMs) || latestEligibleMs < 0) {
		return { buckets: [], latestEligible: null, nextWatermark: null, skippedBefore: null };
	}

	const watermarkMs = watermark === null ? Number.NaN : floorToHourMs(watermark);
	const earliestRawMs = earliestRaw === null ? Number.NaN : floorToHourMs(earliestRaw);
	const buckets = new Set();
	let skippedBefore = null;

	if (!Number.isFinite(watermarkMs)) {
		const firstMs =
			Number.isFinite(earliestRawMs) && earliestRawMs >= 0
				? earliestRawMs
				: latestEligibleMs - Math.max(0, safeLateWindow - 1) * HOUR_MS;
		for (let bucketMs = Math.max(0, firstMs); bucketMs <= latestEligibleMs; bucketMs += HOUR_MS) {
			if (buckets.size >= safeMaxBuckets) break;
			buckets.add(bucketMs);
		}
	} else {
		// Recompute the recent committed buckets only when new late rows have arrived.
		if (recomputeLate && safeLateWindow > 0) {
			let lateStartMs = watermarkMs - (safeLateWindow - 1) * HOUR_MS;
			if (Number.isFinite(earliestRawMs)) lateStartMs = Math.max(lateStartMs, earliestRawMs);
			for (let bucketMs = Math.max(0, lateStartMs); bucketMs <= watermarkMs; bucketMs += HOUR_MS) {
				if (buckets.size >= safeMaxBuckets) break;
				buckets.add(bucketMs);
			}
		}

		let nextStartMs = watermarkMs + HOUR_MS;
		if (Number.isFinite(earliestRawMs) && nextStartMs < earliestRawMs) {
			skippedBefore = isoFromMs(nextStartMs);
			nextStartMs = earliestRawMs;
		}
		for (let bucketMs = Math.max(0, nextStartMs); bucketMs <= latestEligibleMs; bucketMs += HOUR_MS) {
			if (buckets.size >= safeMaxBuckets) break;
			buckets.add(bucketMs);
		}
	}

	const ordered = [...buckets].sort((left, right) => left - right);
	const lastProcessedMs = ordered.length > 0 ? ordered[ordered.length - 1] : Number.NaN;
	const nextWatermarkMs = Number.isFinite(watermarkMs)
		? Math.max(watermarkMs, Number.isFinite(lastProcessedMs) ? lastProcessedMs : watermarkMs)
		: lastProcessedMs;

	return {
		buckets: ordered.map(isoFromMs),
		latestEligible: isoFromMs(latestEligibleMs),
		nextWatermark: Number.isFinite(nextWatermarkMs) ? isoFromMs(nextWatermarkMs) : null,
		skippedBefore,
	};
};

/**
 * Raw detail may only be pruned up to the point the hourly rollup has committed. Without a
 * committed watermark the raw rows stay, even when the configured retention has already passed.
 *
 * @param {Object} options
 * @param {string} options.detailedCutoff
 * @param {string|null} options.coveredThrough - Exclusive end of the committed hourly coverage.
 * @returns {string|null}
 */
export const resolveDetailPruneCutoff = ({ detailedCutoff, coveredThrough }) => {
	const cutoffMs = toTimestampMs(detailedCutoff);
	const coveredMs = toTimestampMs(coveredThrough);
	if (!Number.isFinite(cutoffMs) || !Number.isFinite(coveredMs)) return null;
	return isoFromMs(Math.min(cutoffMs, coveredMs));
};
