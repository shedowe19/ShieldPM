import type { FirewallPolicy } from "src/api/backend/models";

export const MAX_FIREWALL_ASN = 4_294_967_295;
export const MAX_FIREWALL_ASN_RULES = 1000;

export const parseFirewallAsn = (value: string): number | null => {
	const match = /^(?:AS)?([0-9]+)$/i.exec(value.trim());
	if (!match) return null;
	const asn = Number(match[1]);
	return Number.isSafeInteger(asn) && asn > 0 && asn <= MAX_FIREWALL_ASN ? asn : null;
};

/** Invalid editor rows remain in the draft; both save and config preview must reject them. */
export const firewallAsnRuleError = (rules?: FirewallPolicy["asnDenylist"]): string | null => {
	if (rules === undefined) return null;
	if (!Array.isArray(rules)) return "firewall.host.asn.invalid";
	if (rules.length > MAX_FIREWALL_ASN_RULES) return "firewall.host.asn.limit";
	const seen = new Set<number>();
	for (const rule of rules) {
		if (!rule || !Number.isSafeInteger(rule.asn) || rule.asn < 1 || rule.asn > MAX_FIREWALL_ASN) {
			return "firewall.host.asn.invalid";
		}
		if (typeof rule.reason !== "string" || rule.reason.length > 1000 || rule.reason.includes("\0")) {
			return "firewall.host.asn.reasonInvalid";
		}
		if (seen.has(rule.asn)) return "firewall.host.asn.duplicate";
		seen.add(rule.asn);
	}
	return null;
};
