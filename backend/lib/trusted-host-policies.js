import { sanitizeHostMeta } from "./host-response.js";
import { validateHostTrafficPolicy } from "./host-traffic-policy.js";
import { hasActiveRetiredHostBindings, retireHostRuntime } from "./retired-host-metadata.js";

/** Only for server-encrypted revision snapshots, never request bodies or GitOps imports. */
export function validateTrustedHostPolicies(candidate, previous) {
	// A complete historical snapshot replaces metadata; absent policies must not be resurrected.
	const active = hasActiveRetiredHostBindings(candidate.meta);
	const retired = retireHostRuntime(candidate);
	candidate.meta = sanitizeHostMeta(retired.meta);
	if (active) candidate.enabled = 0;
	validateHostTrafficPolicy(candidate, { ...previous, meta: {} });
}
