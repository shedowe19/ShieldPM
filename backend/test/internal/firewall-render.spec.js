import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));
vi.mock("../../internal/firewall-list.js", () => ({ default: { getForHost: vi.fn() } }));
vi.mock("../../lib/firewall-geoip.js", () => ({
	assertAsnFirewallAvailable: vi.fn(),
	assertConfiguredFirewallLookups: vi.fn(),
	assertCountryFirewallAvailable: vi.fn(),
	getFirewallGeoipStatus: vi.fn(),
}));

import lists from "../../internal/firewall-list.js";
import nginx from "../../internal/nginx.js";
import {
	assertAsnFirewallAvailable,
	assertCountryFirewallAvailable,
	getFirewallGeoipStatus,
} from "../../lib/firewall-geoip.js";
import { buildFirewallRender } from "../../lib/firewall-render.js";

const host = (policy = {}, extra = {}) => ({
	id: 17,
	enabled: true,
	domain_names: ["protected.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
	locations: [{ path: "/custom", forward_scheme: "http", forward_host: "127.0.0.2", forward_port: 8081 }],
	meta: { ip_firewall: { enabled: true, list_ids: [], allowlist: [], denylist: [], ...policy } },
	...extra,
});

describe("mandatory host IP firewall config", () => {
	beforeEach(() => {
		getFirewallGeoipStatus.mockResolvedValue({ available: false, asn: { available: false } });
	});
	afterEach(() => vi.clearAllMocks());

	it("canonicalizes duplicate IPv4 and IPv6 CIDRs while retaining the first reason", async () => {
		const data = await buildFirewallRender(
			host({
				allowlist: ["192.0.2.4", "192.0.2.4/32", "2001:db8::1234/64"],
				denylist: [
					{ address: "198.51.100.91/24", reason: "first" },
					{ address: "198.51.100.0/24", reason: "second" },
					{ address: "2001:db8:1::f/64", reason: "IPv6" },
				],
			}),
		);
		expect(data.allow_rules).toEqual([
			{ address: "192.0.2.4/32", value: 1 },
			{ address: "2001:db8::/64", value: 1 },
		]);
		expect(data.manual_rules).toEqual([
			{ address: "198.51.100.0/24", value: 1 },
			{ address: "2001:db8:1::/64", value: 2 },
		]);
		expect(data.details.map((rule) => rule.reason)).toEqual(["first", "IPv6"]);
	});

	it("embeds the original ShieldPM icon geometry and gradients without a runtime asset request", async () => {
		const original = await fs.readFile(
			new URL("../../../frontend/public/images/logo-no-text.svg", import.meta.url),
			"utf8",
		);
		const { page } = await buildFirewallRender(host());
		const icons = [...page.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)]
			.map(([svg]) => svg)
			.filter((svg) => /\bviewBox="0 0 512 512"/.test(svg));
		expect(icons).toHaveLength(1);
		// Ignore presentation-only classes while preserving every original vector
		// coordinate, paint, gradient stop and gradient reference.
		const vectorAttributes = new Set([
			"xmlns",
			"viewBox",
			"fill",
			"fill-opacity",
			"stroke",
			"stroke-width",
			"stroke-linecap",
			"stroke-linejoin",
			"width",
			"height",
			"id",
			"x1",
			"y1",
			"x2",
			"y2",
			"gradientUnits",
			"offset",
			"stop-color",
			"d",
			"cx",
			"cy",
			"r",
			"x",
			"y",
			"rx",
		]);
		const vectors = (svg) =>
			[...svg.matchAll(/<(svg|linearGradient|stop|path|circle|rect)\b([^>]*)>/g)].map(([, tag, attributes]) => ({
				tag,
				attributes: Object.fromEntries(
					[...attributes.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)]
						.filter(([, name]) => vectorAttributes.has(name))
						.map(([, name, value]) => [name, value.trim().replace(/\s+/g, " ")]),
				),
			}));
		expect(vectors(icons[0])).toEqual(vectors(original));
		expect(icons[0]).not.toMatch(/<script\b|<foreignObject\b|\b(?:href|src)\s*=/i);
	});

	it("retains overlapping networks and deterministically assigns equal networks to the first selected list", async () => {
		const data = await buildFirewallRender(host({ list_ids: [9, 3] }), [
			{ id: 3, name: "Second", reason: "second", entries: ["198.51.100.0/24", "198.51.100.128/25"] },
			{ id: 9, name: "First", reason: "first", entries: ["198.51.100.0/24", "203.0.113.0/24"] },
		]);
		expect(data.list_rules).toEqual([
			{ address: "198.51.100.0/24", value: 1 },
			{ address: "203.0.113.0/24", value: 1 },
			{ address: "198.51.100.128/25", value: 2 },
		]);
		expect(data.details.map((rule) => rule.source)).toEqual(["First", "Second"]);
	});

	it("does not load lists or emit firewall code for disabled, deleted or unprotected hosts", async () => {
		for (const entry of [host({}, { enabled: false }), host({}, { is_deleted: true }), host({ enabled: false })]) {
			const config = await nginx.renderConfig("proxy_host", entry);
			expect(config).not.toContain("spm_fw_");
		}
		expect(lists.getForHost).not.toHaveBeenCalled();
		expect(getFirewallGeoipStatus).not.toHaveBeenCalled();
	});

	it("renders manual-only rules without querying subscription storage", async () => {
		const config = await nginx.renderConfig(
			"proxy_host",
			host({ denylist: [{ address: "192.0.2.9", reason: "manual" }] }),
		);
		expect(config).toContain("192.0.2.9/32 1;");
		expect(config).not.toContain("geoip2_country_code");
		expect(lists.getForHost).not.toHaveBeenCalled();
	});

	it("reuses Analytics country lookup with known codes, optional unknown blocking and IP precedence", async () => {
		getFirewallGeoipStatus.mockResolvedValue({ available: true, asn: { available: false } });
		lists.getForHost.mockResolvedValue([{ id: 9, name: "VPN", reason: "list", entries: ["198.51.100.0/24"] }]);
		const policy = {
			list_ids: [9],
			denylist: [{ address: "198.51.100.2", reason: "manual" }],
			country_denylist: ["DE", "XK"],
			block_unknown_country: true,
		};
		const config = await nginx.renderConfig("proxy_host", host(policy));
		expect(config).toContain("map $geoip2_country_code $spm_fw_17_country");
		expect(config).toContain("XK XK;");
		expect(config).toContain("default XX;");
		expect(config).toContain("DE 3;");
		expect(config).toContain("XX 4;");
		expect(config).toContain("0 $spm_fw_17_country_rule;");
		expect(config).toContain("0 $spm_fw_17_list_or_country;");
		expect(config).toContain('"country_code":"$spm_fw_17_country_info"');
		expect(config).not.toContain("geoip2 /");
		const data = await buildFirewallRender(host(policy), [
			{ id: 9, name: "VPN", reason: "list", entries: ["198.51.100.0/24"] },
		]);
		expect(data.known_country_codes).toHaveLength(250);
		expect(data.details.map((rule) => rule.source_type)).toEqual(["manual", "list", "country", "country_unknown"]);
	});

	it("loads lookup readiness once and shares optional country/ASN information on an IP denial", async () => {
		const status = { available: true, asn: { available: true } };
		getFirewallGeoipStatus.mockResolvedValue(status);
		const policy = { denylist: [{ address: "2001:db8::9", reason: "manual" }] };
		const entry = host(policy);
		const config = await nginx.renderConfig("proxy_host", entry);
		expect(getFirewallGeoipStatus).toHaveBeenCalledOnce();
		expect(assertCountryFirewallAvailable).toHaveBeenCalledWith(entry.meta.ip_firewall, status);
		expect(assertAsnFirewallAvailable).toHaveBeenCalledWith(entry.meta.ip_firewall, status);
		expect(config).not.toContain("map $geoip2_country_code");
		expect(config).not.toContain("map $spm_geoip2_asn");
		expect(config).toContain("local raw_country = ngx.var.geoip2_country_code");
		expect(config).toContain('tonumber(ngx.var.spm_geoip2_asn or "")');
		expect(config).toContain('organization = ngx.var.spm_geoip2_asn_org or ""');
		expect(config).toContain('set $spm_fw_17_country_info "";');
		expect(config).toContain('set $spm_fw_17_asn_info "";');
		expect(config).toContain('"asn_organization":"$spm_fw_17_asn_org_info"');
		expect(config).toContain("asn = asn, asn_organization = organization");
	});

	it("keeps ASN rules independent of the country capability and inserts them before country matches", async () => {
		getFirewallGeoipStatus.mockResolvedValue({ available: false, asn: { available: true } });
		const config = await nginx.renderConfig(
			"proxy_host",
			host({ asn_denylist: [{ asn: 15169, reason: "Network" }] }),
		);
		expect(config).toContain("map $spm_geoip2_asn $spm_fw_17_asn_rule");
		expect(config).toContain("15169 1;");
		expect(config).toContain("0 $spm_fw_17_asn_or_country;");
		expect(config).not.toContain("geoip2_country_code");
		const data = await buildFirewallRender(
			host({
				denylist: [{ address: "2001:db8::1", reason: "manual" }],
				list_ids: [7],
				asn_denylist: [{ asn: 15169, reason: "ASN" }],
				country_denylist: ["GB"],
			}),
			[{ id: 7, name: "list", reason: "list", entries: ["2001:db8::/32"] }],
		);
		expect(data.details.map((rule) => rule.source_type)).toEqual(["manual", "list", "asn", "country"]);
		expect(data.asn_rules).toEqual([{ asn: 15169, value: 3 }]);
		expect(data.country_rules).toEqual([{ code: "GB", value: 4 }]);
	});

	it.each([0, -1, 1.5, 4294967296, "15169; return 200;"])("never emits invalid ASN map key %s", async (asn) => {
		await expect(buildFirewallRender(host({ asn_denylist: [{ asn }] }))).rejects.toThrow("integer");
	});

	it("fails closed when an explicitly unavailable source is required by an active policy", async () => {
		await expect(
			buildFirewallRender(host({ asn_denylist: [{ asn: 15169 }] }), [], { country: true, asn: false }),
		).rejects.toThrow("ASN filtering");
		await expect(
			buildFirewallRender(host({ country_denylist: ["GB"] }), [], { country: false, asn: true }),
		).rejects.toThrow("Country filtering");
	});

	it.each([false, true])(
		"keeps ASN enforcement before OAuth/WAF and outside Anubis internals (%s)",
		async (anubis) => {
			getFirewallGeoipStatus.mockResolvedValue({ available: false, asn: { available: true } });
			const config = await nginx.renderConfig(
				"proxy_host",
				host(
					{
						asn_denylist: [{ asn: 4294967295, reason: '<script>"ASN"</script>' }],
						allowlist: ["2001:db8:1::/64"],
					},
					{
						anubis_enabled: anubis,
						block_exploits: true,
						access_list_id: 4,
						access_list: { meta: { auth_type: "oauth2_proxy" }, clients: [], items: [] },
					},
				),
			);
			expect(config).toContain("4294967295 1;");
			expect(config).toContain("2001:db8:1::/64 1;");
			expect(config).toContain("modsecurity on;");
			expect(config).toContain("modsecurity off;");
			expect(config).toContain("error_page       401 403 = @oauth2_proxy_signin;");
			expect(config).toContain("access_by_lua_block { }");
			expect(config.match(/if \(\$spm_fw_17_blocked\)/g)).toHaveLength(1);
			expect(config).toContain("ASN-Regel");
			expect(config).toContain("labels.asn_organization = organization");
			expect(config).not.toContain("geoip2_country_code");
			if (anubis)
				expect(config.slice(config.indexOf("# --- Backend Server (Internal) ---"))).not.toContain("spm_fw_");
		},
	);

	it("can use country rules alone and omits unknown blocking unless selected", async () => {
		const data = await buildFirewallRender(host({ country_denylist: ["GB"], country_reason: "Country policy" }));
		expect(data.country_rules).toEqual([{ code: "GB", value: 1 }]);
		expect(data.details).toEqual([{ id: 1, reason: "Country policy", source: "", source_type: "country" }]);
		expect(data.manual_rules).toEqual([]);
		expect(data.list_rules).toEqual([]);
	});

	it.each([false, true])(
		"enforces before redirects/auth and only at the public ingress with Anubis=%s",
		async (anubis) => {
			lists.getForHost.mockResolvedValue([
				{ id: 9, name: "VPN", reason: "VPN policy", entries: ["198.51.100.0/24"] },
			]);
			const config = await nginx.renderConfig(
				"proxy_host",
				host(
					{ list_ids: [9], denylist: [{ address: "198.0.0.0/8", reason: "manual" }] },
					{
						anubis_enabled: anubis,
						access_list_id: 4,
						access_list: { meta: { auth_type: "oauth2_proxy" }, clients: [], items: [] },
						certificate_id: 5,
						certificate: { provider: "internal" },
						ssl_forced: true,
					},
				),
			);
			expect(config.match(/if \(\$spm_fw_17_blocked\)/g)).toHaveLength(1);
			expect(config.indexOf("if ($spm_fw_17_blocked)")).toBeLessThan(config.indexOf("return 308"));
			expect(config.indexOf("geo $spm_fw_17_allow")).toBeLessThan(config.indexOf("server {"));
			expect(config).toContain("0 $spm_fw_17_list;");
			expect(config).toContain("error_page 470 = @spm_ip_blocked_17;");
			expect(config).toContain("error_page       401 403 = @oauth2_proxy_signin;");
			expect(config).toContain("recursive_error_pages off;");
			expect(config).toContain("ngx.status = ngx.HTTP_FORBIDDEN");
			expect(config).toContain("auth_request off;");
			expect(config).toContain("geo $spm_fw_17_manual");
			expect(config).toContain("geo $spm_fw_17_list");
			expect(config).toContain("~^/\\.well-known/acme-challenge/[A-Za-z0-9_-]+$ 1;");
			expect(config).toContain("location /custom");
			if (anubis) {
				const internal = config.slice(config.indexOf("# --- Backend Server (Internal) ---"));
				expect(internal).not.toContain("spm_fw_");
				expect(internal).toContain("real_ip_header X-Real-IP;");
			}
		},
	);

	it("escapes malicious reason/source text as Lua data and never embeds internal notes", async () => {
		lists.getForHost.mockResolvedValue([
			{ id: 9, name: 'VPN"\n}; return 200; #', reason: '<script>"\\\n</script>', entries: ["203.0.113.0/24"] },
		]);
		const config = await nginx.renderConfig(
			"proxy_host",
			host({ list_ids: [9], internal_note: "SECRET INTERNAL NOTE" }),
		);
		expect(config).not.toContain("SECRET INTERNAL NOTE");
		expect(config).not.toContain('VPN"\n}; return 200; #');
		expect(config).toContain("VPN\\034\\010}; return 200; #");
		expect(config).toContain('gsub("[&<>\\"\']"');
		expect(config).toContain("escape=json");
		expect(config).toContain("no-store, no-cache, must-revalidate");
	});

	it("uses a unique valid variable name for an unsaved preview and shares large subscription reasons", async () => {
		const entries = Array.from({ length: 4096 }, (_, index) => `10.${index >> 8}.${index & 255}.0/24`);
		const data = await buildFirewallRender(host({ list_ids: [9] }, { id: 0 }), [
			{ id: 9, name: "large", reason: "one reason", entries },
		]);
		expect(data.id).toBe(0);
		expect(data.list_rules).toHaveLength(4096);
		expect(data.details).toHaveLength(1);
	});
});
