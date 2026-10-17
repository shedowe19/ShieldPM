import { createHash } from "node:crypto";
import { normalizeUpstreamPool } from "./host-traffic-policy.js";

const observations = new Map();
/** Fingerprint serving topology and HTTP identity; a changed pool cannot inherit old probe results. */
export const poolObservationKey = (host) =>
	createHash("sha256")
		.update(
			JSON.stringify({
				scheme: host.forward_scheme,
				domains: (host.domain_names || []).slice(0, 5),
				pool: normalizeUpstreamPool(host.meta?.upstream_pool, host),
			}),
		)
		.digest("hex");
export const clearPoolObservations = (hostId) => observations.delete(Number(hostId));
export const recordPoolObservations = (host, targets, checkedAt) => {
	observations.delete(Number(host.id));
	observations.set(Number(host.id), {
		key: poolObservationKey(host),
		expires: Date.now() + 5 * 60_000,
		targets: new Map(targets.map((target) => [target.id, { ...target, checked_at: checkedAt }])),
	});
	if (observations.size > 100) observations.delete(observations.keys().next().value);
};
/** Recent direct HTTP/TCP checks, separate from Nginx passive failure counters and on-demand TCP reachability. */
export const getPoolObservations = (host) => {
	const record = observations.get(Number(host.id));
	return record && record.expires >= Date.now() && record.key === poolObservationKey(host)
		? record.targets
		: new Map();
};
