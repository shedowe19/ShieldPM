import { sanitizeHostMeta } from "../lib/host-response.js";
import { validateHostTrafficPolicy } from "../lib/host-traffic-policy.js";
import {
	hasActiveRetiredHostBindings,
	readRetiredHostMetadata,
	retireHostRuntime,
} from "../lib/retired-host-metadata.js";

/**
 * Merge only requested metadata into the current trusted row. The update caller
 * holds its short row lock so a blank secret cannot restore an earlier rotation.
 * @param {Object} data
 * @param {Object} current
 * @param {Object|undefined} requestedMeta
 * @returns {Promise<void>}
 */
export async function prepareProxyHostPolicies(data, current = {}, requestedMeta = data.meta) {
	const incoming = structuredClone(readRetiredHostMetadata(requestedMeta));
	const existingMeta = readRetiredHostMetadata(current.meta);
	if (Object.hasOwn(incoming, "ip_firewall") && data.meta?.ip_firewall) incoming.ip_firewall = data.meta.ip_firewall;
	const mergedMeta = { ...existingMeta, ...incoming };
	const candidate = retireHostRuntime({ ...current, ...data, meta: mergedMeta });
	if (hasActiveRetiredHostBindings(existingMeta) || hasActiveRetiredHostBindings(mergedMeta)) {
		data.enabled = 0;
		candidate.enabled = 0;
	}
	validateHostTrafficPolicy(candidate, { ...current, meta: sanitizeHostMeta(existingMeta) });
	data.meta = sanitizeHostMeta(candidate.meta);
}
