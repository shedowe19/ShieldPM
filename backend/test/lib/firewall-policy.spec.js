import { describe, expect, it } from "vitest";
import { normalizeFirewallPolicy } from "../../lib/firewall-policy.js";

describe("host IP firewall policy boundary", () => {
	it("defaults to disabled and normalizes networks without expanding addresses", () => {
		expect(
			normalizeFirewallPolicy({
				allowlist: ["192.0.2.7/24", "192.0.2.0/24"],
				denylist: [{ address: "2001:db8::9/64", reason: "  Maintenance  " }],
				list_ids: [2, 2],
			}),
		).toMatchObject({
			enabled: false,
			allowlist: ["192.0.2.0/24"],
			denylist: [{ address: "2001:db8::/64", reason: "Maintenance" }],
			list_ids: [2],
		});
	});
	it.each([
		{ enabled: "true" },
		{ list_ids: ["1"] },
		{ list_ids: [0] },
		{ list_ids: Array.from({ length: 33 }, (_, index) => index + 1) },
		{ allowlist: ["all"] },
		{ allowlist: ["192.0.2.1; return 200;"] },
		{ denylist: [{ address: "bad IP" }] },
		{ denylist: [{ address: "192.0.2.1" }, { address: "192.0.2.1/32" }] },
		{ internal_note: "\0" },
		{ support_url: "javascript:alert(1)" },
		{ support_url: "https://user:password@example.com" },
		{ public_message: "x".repeat(2001) },
		{ hidden_rule: true },
	])("rejects unsafe or malformed policies even while disabled: %j", (input) => {
		expect(() => normalizeFirewallPolicy({ enabled: false, ...input })).toThrow();
	});
	it("allows explanatory HTML as data and validates the separate contact URL", () => {
		expect(
			normalizeFirewallPolicy({
				public_message: "<b>Blocked</b>",
				support_url: "https://support.example/?a=1&b=2",
			}),
		).toMatchObject({ public_message: "<b>Blocked</b>", support_url: "https://support.example/?a=1&b=2" });
	});
});
