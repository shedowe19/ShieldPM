/**
 * Tool risk classification.
 *
 * The classifier is deliberately fail-closed: only tools whose names are
 * unambiguously read-only run without an explicit user confirmation. Every
 * other tool - including future tools - is treated as mutating.
 */

const READ_ONLY_PREFIXES = ["get_", "read_", "test_", "validate_"];

/**
 * Returns true when the tool changes state and therefore needs confirmation.
 * @param {string} toolName
 * @returns {boolean}
 */
export const needsConfirmation = (toolName) => {
	if (typeof toolName !== "string" || toolName.length === 0) return true;
	return !READ_ONLY_PREFIXES.some((prefix) => toolName.startsWith(prefix));
};

/**
 * Returns true when the tool is a pure read operation.
 * @param {string} toolName
 * @returns {boolean}
 */
export const isReadOnlyTool = (toolName) => !needsConfirmation(toolName);

/**
 * Returns a stable, human readable target for a tool call so the frontend can
 * show what an action is about to touch.
 * @param {Object} args
 * @returns {string}
 */
export const describeToolTarget = (args) => {
	if (!args || typeof args !== "object") return "";
	const domains = args.domain_names;
	if (Array.isArray(domains) && domains.length > 0) return domains.join(", ");
	for (const key of ["name", "email", "common_name", "nickname", "domain", "id", "host_id", "proxy_host_id"]) {
		if (args[key] !== undefined && args[key] !== null && args[key] !== "") return String(args[key]);
	}
	return "";
};

/**
 * Strips a model supplied tool call down to the fields the confirmation dialog
 * and the execution path need. Never forward provider internals.
 * @param {Object} call
 * @returns {{name: string, target: string, args: Object}}
 */
export const toPendingTool = (call) => ({
	name: String(call?.name || ""),
	target: describeToolTarget(call?.args),
	args: call?.args && typeof call.args === "object" && !Array.isArray(call.args) ? call.args : {},
});
