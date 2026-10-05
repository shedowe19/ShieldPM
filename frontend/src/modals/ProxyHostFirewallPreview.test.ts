import { describe, expect, it } from "vitest";
import { renderProxyHostFirewallPreview } from "./ProxyHostFirewallPreview";
import { createProxyHostFirewallPolicy } from "./ProxyHostModalFormValues";

describe("renderProxyHostFirewallPreview", () => {
	it("uses the public template, escapes all visitor-facing data and never includes internal notes", () => {
		const page = renderProxyHostFirewallPreview({
			language: "de-DE",
			host: '<img src=x onerror="alert(1)">',
			policy: createProxyHostFirewallPolicy({
				denylist: [{ address: "203.0.113.42", reason: '<script>alert("reason")</script>' }],
				publicMessage: '<img src=x onerror="alert(2)">',
				internalNote: "PRIVATE ADMIN NOTE",
				supportUrl: "javascript:alert(1)",
			}),
		});
		expect(page).toContain("Zugriff eingeschränkt");
		expect(page).toContain("&lt;script&gt;alert(&quot;reason&quot;)&lt;/script&gt;");
		expect(page).not.toContain("<script>");
		expect(page).not.toContain("<img");
		expect(page).not.toContain("PRIVATE ADMIN NOTE");
		expect(page).not.toContain("javascript:");
		expect(page).toContain('href="" rel="noreferrer" hidden');
		expect(page).toContain("203.0.113.42");
		expect(page).not.toMatch(/%\{[a-z_]+\}/);
	});

	it("shows the first selected active list's reason and escapes its name", () => {
		const page = renderProxyHostFirewallPreview({
			policy: createProxyHostFirewallPolicy({ listIds: [8, 4], supportUrl: "https://example.com/support" }),
			lists: [
				{ id: 4, name: "<b>VPN & proxy</b>", reason: "VPN network restriction", enabled: true },
				{ id: 8, name: "Paused", reason: "Do not use", enabled: false },
			],
		});
		expect(page).toContain("VPN network restriction");
		expect(page).toContain("&lt;b&gt;VPN &amp; proxy&lt;/b&gt;");
		expect(page).not.toContain("Do not use");
		expect(page).toContain('href="https://example.com/support"');
	});

	it("keeps manual rule precedence and rejects credential-bearing support links", () => {
		const page = renderProxyHostFirewallPreview({
			policy: createProxyHostFirewallPolicy({
				listIds: [4],
				denylist: [{ address: "203.0.113.42", reason: "Manual reason" }],
				supportUrl: "https://user:secret@example.com/support",
			}),
			lists: [{ id: 4, name: "VPN", reason: "List reason", enabled: true }],
		});
		expect(page).toContain("Manual reason");
		expect(page).toContain("Manual IP block");
		expect(page).not.toContain("List reason");
		expect(page).not.toContain("secret");
	});

	it("shows a country-rule example with an escaped custom reason and the selected ISO code", () => {
		const page = renderProxyHostFirewallPreview({
			language: "de",
			policy: createProxyHostFirewallPolicy({
				countryDenylist: ["DE"],
				countryReason: "Regionalzugriff <gesperrt>",
			}),
		});
		expect(page).toContain("GeoIP-Länderregel");
		expect(page).toContain("Regionalzugriff &lt;gesperrt&gt;");
		expect(page).toContain("Erkanntes Land (ISO)");
		expect(page).toContain("<dd>DE</dd>");
		expect(page).not.toMatch(/%\{[a-z_]+\}/);
	});

	it("distinguishes explicit unknown-country blocks and hides the country row for IP-only hosts", () => {
		const unknownPage = renderProxyHostFirewallPreview({
			policy: createProxyHostFirewallPolicy({ blockUnknownCountry: true }),
		});
		expect(unknownPage).toContain("Unknown (XX)");
		expect(unknownPage).toContain("unknown country assignment");
		expect(unknownPage).toContain("GeoIP country rule");
		const ipPage = renderProxyHostFirewallPreview({ policy: createProxyHostFirewallPolicy() });
		expect(ipPage).toContain("<div hidden><dt>Detected country (ISO)</dt>");
	});

	it("uses an ASN rule before a country rule and escapes its public reason", () => {
		const page = renderProxyHostFirewallPreview({
			language: "de",
			policy: createProxyHostFirewallPolicy({
				asnDenylist: [{ asn: 13335, reason: "<b>Netzwerk & Anbieter</b>" }],
				countryDenylist: ["DE"],
				countryReason: "Lower priority country reason",
				internalNote: "PRIVATE ASN CASE",
			}),
		});
		expect(page).toContain("ASN-Regel");
		expect(page).toContain("&lt;b&gt;Netzwerk &amp; Anbieter&lt;/b&gt;");
		expect(page).toContain("<dd>AS13335</dd>");
		expect(page).toContain("Netzwerkbetreiber (Beispiel)");
		expect(page).not.toContain("Lower priority country reason");
		expect(page).not.toContain("PRIVATE ASN CASE");
		expect(page).not.toMatch(/%\{[a-z_]+\}/);
	});

	it("uses a localized ASN default without claiming a real network operator", () => {
		const policy = createProxyHostFirewallPolicy({ asnDenylist: [{ asn: 4294967295, reason: "" }] });
		const english = renderProxyHostFirewallPreview({ policy });
		expect(english).toContain("blocked autonomous system AS4294967295");
		expect(english).toContain("Network operator (example)");
		const german = renderProxyHostFirewallPreview({ policy, language: "de" });
		expect(german).toContain("gesperrten autonomen System AS4294967295");
		expect(german).toContain("Netzwerkbetreiber (Beispiel)");
	});

	it("keeps IP-list precedence while showing independent example ASN information only when available", () => {
		const options = {
			policy: createProxyHostFirewallPolicy({
				listIds: [4],
				asnDenylist: [{ asn: 13335, reason: "Lower priority ASN reason" }],
			}),
			lists: [{ id: 4, name: "VPN", reason: "List reason", enabled: true }],
		};
		const page = renderProxyHostFirewallPreview({ ...options, asnAvailable: true });
		expect(page).toContain("List reason");
		expect(page).not.toContain("Lower priority ASN reason");
		expect(page).toContain("<dd>AS13335</dd>");
		const unavailable = renderProxyHostFirewallPreview({ ...options, asnAvailable: false });
		expect(unavailable).toContain("<div hidden><dt>Autonomous system (ASN)</dt><dd></dd>");
		expect(unavailable).not.toContain("Network operator (example)");
	});
});
