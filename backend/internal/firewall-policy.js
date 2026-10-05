import errs from "../lib/error.js";
import {
	assertAsnFirewallAvailable,
	assertCountryFirewallAvailable,
	getFirewallGeoipStatus,
} from "../lib/firewall-geoip.js";
import { normalizeFirewallPolicy } from "../lib/firewall-policy.js";

const readMeta = (value) => {
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			throw new errs.ValidationError("Invalid host metadata JSON");
		}
	}
	return value || {};
};

/** Check independent country and ASN prerequisites, sharing one inspection for a combined policy.
 * @param {Object} policy
 * @returns {Promise<void>}
 */
export const assertHostFirewallGeoipAvailable = async (policy) => {
	const country = policy?.enabled && (policy.country_denylist?.length || policy.block_unknown_country);
	const asn = policy?.enabled && policy.asn_denylist?.length;
	if (country && asn) {
		const status = await getFirewallGeoipStatus();
		await assertCountryFirewallAvailable(policy, status);
		await assertAsnFirewallAvailable(policy, status);
		return;
	}
	await assertCountryFirewallAvailable(policy);
	await assertAsnFirewallAvailable(policy);
};

/** Normalize host settings and authorize any newly assigned firewall list before writing or previewing.
 * @param {import("../lib/types.js").Access} access
 * @param {Object} data
 * @param {Object} [existing]
 */
export const validateHostFirewall = async (access, data, existing = {}) => {
	// Partial host edits must retain their existing firewall and unrelated metadata.
	const meta = { ...readMeta(existing.meta), ...readMeta(data.meta) };
	if (!Object.hasOwn(meta, "ip_firewall")) return;
	const policy = normalizeFirewallPolicy(meta.ip_firewall);
	if (!policy) return;
	await assertHostFirewallGeoipAvailable(policy);
	const previous = readMeta(existing.meta)?.ip_firewall;
	const previousIds = new Set(Array.isArray(previous?.list_ids) ? previous.list_ids : []);
	const addedIds = policy.list_ids.filter((id) => !previousIds.has(id));
	if (addedIds.length) {
		const { default: lists } = await import("./firewall-list.js");
		for (const id of addedIds) await lists.get(access, { id });
	}
	data.meta = { ...meta, ip_firewall: policy };
};

/** A config preview also exposes existing rules, including assignments removed from the draft. */
export const validateFirewallPreviewReferences = async (access, data, existing = {}) => {
	const ids = new Set([
		...(normalizeFirewallPolicy(readMeta(existing.meta)?.ip_firewall)?.list_ids || []),
		...(normalizeFirewallPolicy(readMeta(data.meta)?.ip_firewall)?.list_ids || []),
	]);
	if (!ids.size) return;
	const { default: lists } = await import("./firewall-list.js");
	for (const id of ids) await lists.get(access, { id });
};

/** Keep list deletion and the final host database write mutually exclusive.
 * @template T
 * @param {Object} data
 * @param {Object} existing
 * @param {() => Promise<T>} write
 * @returns {Promise<T>}
 */
export const withFirewallReferences = async (data, existing, write) => {
	const meta = readMeta(data.meta === undefined ? existing.meta : data.meta);
	const ids = meta?.ip_firewall?.list_ids || [];
	if (!ids.length) return write();
	const { default: lists } = await import("./firewall-list.js");
	const { default: nginx } = await import("./nginx.js");
	return nginx.withConfigurationLock(async () => {
		await lists.assertExistForHost(ids);
		return write();
	});
};
