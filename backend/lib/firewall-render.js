import fs from "node:fs/promises";
import ipaddr from "ipaddr.js";
import { normalizeAddress } from "./firewall-addresses.js";

let pageTemplate;

/** Convert equivalent CIDRs and single addresses to a single safe Nginx geo key. */
const networkKey = (value) => {
	const normalized = normalizeAddress(value);
	const [address, prefix] = normalized.includes("/")
		? ipaddr.parseCIDR(normalized)
		: [ipaddr.parse(normalized), ipaddr.parse(normalized).kind() === "ipv4" ? 32 : 128];
	const bytes = address.toByteArray().map((byte, index) => {
		const remaining = prefix - index * 8;
		return remaining >= 8 ? byte : remaining <= 0 ? 0 : byte & (255 << (8 - remaining));
	});
	return `${ipaddr.fromByteArray(bytes).toString()}/${prefix}`;
};

/**
 * Compile validated host policy into CIDR maps and numeric rule references.
 * Text is kept out of Nginx directives and is serialized only through the Lua string filter.
 * Manual matches always take precedence over subscriptions; geo chooses the longest matching prefix.
 * @param {Object} host
 * @param {Array<{id:number,name:string,reason:string,entries:string[]}>} lists
 * @returns {Promise<object | null>}
 */
export const buildFirewallRender = async (host, lists = []) => {
	const policy = host.meta?.ip_firewall;
	if (!host.enabled || host.is_deleted || policy?.enabled !== true) return null;
	const allow = new Map();
	const manual = new Map();
	const subscribed = new Map();
	const details = [];
	const ruleIds = new Map();
	const addRule = (target, address, reason, source, sourceType, sourceId) => {
		const key = networkKey(address);
		if (target.has(key)) return;
		// A large subscription shares one reason record instead of duplicating text for every CIDR.
		const identity = sourceType === "list" ? `list:${sourceId}` : `manual:${key}`;
		let ruleId = ruleIds.get(identity);
		if (!ruleId) {
			ruleId = details.length + 1;
			ruleIds.set(identity, ruleId);
			details.push({ id: ruleId, reason: reason || "", source, source_type: sourceType });
		}
		target.set(key, ruleId);
	};
	for (const address of policy.allowlist || []) allow.set(networkKey(address), 1);
	for (const rule of policy.denylist || []) addRule(manual, rule.address, rule.reason, "", "manual");
	const listsById = new Map(lists.map((list) => [list.id, list]));
	for (const listId of policy.list_ids || []) {
		const list = listsById.get(listId);
		if (!list) continue;
		for (const address of list.entries || []) addRule(subscribed, address, list.reason, list.name, "list", list.id);
	}
	pageTemplate ||= fs.readFile(new URL("../templates/ip-blocked.html", import.meta.url), "utf8");
	const rules = (entries) => [...entries].map(([address, value]) => ({ address, value }));
	return {
		id: Number.isSafeInteger(host.id) && host.id >= 0 ? host.id : 0,
		allow_rules: rules(allow),
		manual_rules: rules(manual),
		list_rules: rules(subscribed),
		details,
		public_message: policy.public_message || "",
		support_url: policy.support_url || "",
		page: await pageTemplate,
	};
};
