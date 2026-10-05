import { describe, expect, it } from "vitest";
import { firewallAsnRuleError, MAX_FIREWALL_ASN, parseFirewallAsn } from "./firewallAsn";

describe("firewall ASN input", () => {
	it.each(["AS13335", "13335", " as13335 ", "AS00013335"])("normalizes %s to an integer", (input) => {
		expect(parseFirewallAsn(input)).toBe(13335);
	});
	it("accepts the positive uint32 boundaries", () => {
		expect(parseFirewallAsn("AS1")).toBe(1);
		expect(parseFirewallAsn("4294967295")).toBe(MAX_FIREWALL_ASN);
	});
	it.each(["", "AS", "0", "AS0", "-1", "+1", "1.5", "1e3", "AS 13335", "13335x", "４２", "4294967296"])(
		"rejects %s without silently coercing it",
		(input) => expect(parseFirewallAsn(input)).toBeNull(),
	);
	it("rejects retained invalid draft rows, duplicate ASNs and invalid public reasons", () => {
		expect(firewallAsnRuleError([{ asn: 0, reason: "" }])).toBe("firewall.host.asn.invalid");
		expect(firewallAsnRuleError([{ asn: 1.5, reason: "" }])).toBe("firewall.host.asn.invalid");
		expect(firewallAsnRuleError([{ asn: MAX_FIREWALL_ASN + 1, reason: "" }])).toBe("firewall.host.asn.invalid");
		expect(
			firewallAsnRuleError([
				{ asn: 13335, reason: "" },
				{ asn: 13335, reason: "Other" },
			]),
		).toBe("firewall.host.asn.duplicate");
		expect(firewallAsnRuleError([{ asn: 13335, reason: "x".repeat(1001) }])).toBe(
			"firewall.host.asn.reasonInvalid",
		);
		expect(firewallAsnRuleError([{ asn: 13335, reason: "bad\0reason" }])).toBe("firewall.host.asn.reasonInvalid");
	});
	it("bounds the policy at 1000 unique rules while allowing optional empty reasons", () => {
		const rules = Array.from({ length: 1000 }, (_, index) => ({ asn: index + 1, reason: "" }));
		expect(firewallAsnRuleError(rules)).toBeNull();
		expect(firewallAsnRuleError([...rules, { asn: 1001, reason: "" }])).toBe("firewall.host.asn.limit");
		expect(firewallAsnRuleError(undefined)).toBeNull();
	});
});
