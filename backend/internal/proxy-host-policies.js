import { sanitizeHostMeta } from "../lib/host-response.js";
import { validateHostTrafficPolicy } from "../lib/host-traffic-policy.js";
import { prepareWasmFilters } from "./wasm.js";

/**
 * Merge only requested metadata into the current trusted row. The update caller
 * holds its short row lock so a blank secret cannot restore an earlier rotation.
 * @param {Object} data
 * @param {Object} current
 * @param {Object|undefined} requestedMeta
 * @returns {Promise<void>}
 */
export async function prepareProxyHostPolicies(data, current = {}, requestedMeta = data.meta) {
	const incoming = requestedMeta && typeof requestedMeta === "object" ? structuredClone(requestedMeta) : {};
	if (Object.hasOwn(incoming, "ip_firewall") && data.meta?.ip_firewall) incoming.ip_firewall = data.meta.ip_firewall;
	const candidate = { ...current, ...data, meta: { ...(current.meta || {}), ...incoming } };
	validateHostTrafficPolicy(candidate, current);
	if (Object.hasOwn(incoming, "wasm_filters")) {
		candidate.meta.wasm_filters = await prepareWasmFilters(incoming.wasm_filters, current.meta?.wasm_filters || []);
	}
	data.meta = sanitizeHostMeta(candidate.meta);
}
