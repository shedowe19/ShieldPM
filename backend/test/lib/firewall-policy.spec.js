import { describe, expect, it } from "vitest";
import { FIREWALL_COUNTRY_CODES, normalizeFirewallPolicy } from "../../lib/firewall-policy.js";
import apiValidator from "../../lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "../../schema/index.js";

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
	it("leaves country filtering off for existing policies and canonicalizes explicit country rules", () => {
		expect(normalizeFirewallPolicy({ enabled: true })).toMatchObject({
			country_denylist: [],
			country_reason: "",
			block_unknown_country: false,
		});
		expect(
			normalizeFirewallPolicy({
				country_denylist: ["de", "US", " DE ", "xk"],
				country_reason: "  This host is restricted to selected regions.  ",
				block_unknown_country: true,
			}),
		).toMatchObject({
			country_denylist: ["DE", "US", "XK"],
			country_reason: "This host is restricted to selected regions.",
			block_unknown_country: true,
		});
	});
	it("accepts the complete existing GeoIP country set including Kosovo", () => {
		expect(FIREWALL_COUNTRY_CODES).toHaveLength(250);
		expect(FIREWALL_COUNTRY_CODES).toEqual(expect.arrayContaining(["DE", "GB", "SS", "BQ", "XK"]));
		expect(
			normalizeFirewallPolicy({ country_denylist: [...FIREWALL_COUNTRY_CODES] }).country_denylist,
		).toHaveLength(250);
	});
	it.each([
		{ country_denylist: ["ZZ"] },
		{ country_denylist: ["AA"] },
		{ country_denylist: ["UK"] },
		{ country_denylist: ["AN"] },
		{ country_denylist: ["EU"] },
		{ country_denylist: ["AP"] },
		{ country_denylist: ["A1"] },
		{ country_denylist: ["USA"] },
		{ country_denylist: ["DE; return 200;"] },
		{ country_denylist: [null] },
		{ country_denylist: null },
		{ country_denylist: "DE" },
		{ country_denylist: Array.from({ length: 251 }, () => "DE") },
		{ country_reason: "x".repeat(1001) },
		{ country_reason: "Reason\0" },
		{ country_reason: null },
		{ block_unknown_country: "true" },
		{ block_unknown_country: null },
	])("rejects malformed country filters even for disabled policies: %j", (input) => {
		expect(() => normalizeFirewallPolicy({ enabled: false, ...input })).toThrow();
	});
	it("validates actual proxy-host API country fields through the shared schema", async () => {
		await getCompiledSchema();
		const schema = getValidationSchema("/nginx/proxy-hosts", "post");
		const base = {
			domain_names: ["example.test"],
			forward_scheme: "http",
			forward_host: "upstream.test",
			forward_port: 80,
		};
		await expect(
			apiValidator(schema, {
				...base,
				meta: {
					ip_firewall: {
						country_denylist: ["DE", "XK"],
						country_reason: "Regional restriction",
						block_unknown_country: true,
					},
				},
			}),
		).resolves.toBeTruthy();
		await expect(
			apiValidator(schema, { ...base, meta: { ip_firewall: { country_denylist: ["ZZ"] } } }),
		).rejects.toThrow();
		await expect(
			apiValidator(schema, { ...base, meta: { ip_firewall: { country_reason: "x".repeat(1001) } } }),
		).rejects.toThrow();
	});
});
