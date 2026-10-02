import errs from "../lib/error.js";
import { createApplicationOptions } from "./application-options.js";

/** @typedef {{beautifier_enabled: boolean}} NginxOptions */

/** @param {unknown} data @returns {NginxOptions} */
const validate = (data) => {
	const options = /** @type {NginxOptions} */ (data);
	if (
		!options ||
		typeof options !== "object" ||
		Array.isArray(options) ||
		Object.keys(options).length !== 1 ||
		!Object.hasOwn(options, "beautifier_enabled") ||
		typeof options.beautifier_enabled !== "boolean"
	) {
		throw new errs.ValidationError("Nginx options require a beautifier enabled boolean");
	}
	return { beautifier_enabled: options.beautifier_enabled };
};

export default createApplicationOptions("nginx-options", "Nginx Options", validate);
