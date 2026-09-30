import errs from "../lib/error.js";
import { createApplicationOptions } from "./application-options.js";

/** @typedef {{detailed_retention_hours: number, aggregation_retention_days: number}} AnalyticsOptions */

/** @param {unknown} data @returns {AnalyticsOptions} */
const validate = (data) => {
	const options = /** @type {AnalyticsOptions} */ (data);
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).length !== 2 ||
		!Object.hasOwn(options, "detailed_retention_hours") ||
		!Object.hasOwn(options, "aggregation_retention_days") ||
		!Number.isSafeInteger(options.detailed_retention_hours) ||
		options.detailed_retention_hours < 1 ||
		!Number.isSafeInteger(options.aggregation_retention_days) ||
		options.aggregation_retention_days < 1
	) {
		throw new errs.ValidationError("Analytics retention periods must be positive safe integers in hours and days");
	}
	return {
		detailed_retention_hours: options.detailed_retention_hours,
		aggregation_retention_days: options.aggregation_retention_days,
	};
};

export default createApplicationOptions("analytics-options", "Analytics Options", validate);
