import { analytics as logger } from "../logger.js";

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
 * The rollup may only recompute hours whose raw rows can still exist. With a short detail
 * retention the late window shrinks (or disappears) instead of overwriting a bucket from a
 * partially pruned hour.
 * @param {Object} options
 * @param {number} options.detailedHours
 * @param {number} options.lateWindowHours
 * @returns {number}
 */
export const resolveRollupLateWindow = ({ detailedHours, lateWindowHours }) => {
	const retentionBound = Math.max(0, Math.floor(Number(detailedHours) || 0) - 1);
	return Math.max(0, Math.min(Math.floor(Number(lateWindowHours) || 0), retentionBound));
};
