import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));
vi.mock("../../internal/firewall-list.js", () => ({ default: { getForHost: vi.fn() } }));
vi.mock("../../lib/firewall-geoip.js", () => ({ assertCountryFirewallAvailable: vi.fn() }));

import lists from "../../internal/firewall-list.js";
import nginx from "../../internal/nginx.js";
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
		expect(config).toContain('"country_code":"$spm_fw_17_country"');
		expect(config).not.toContain("geoip2 /");
		const data = await buildFirewallRender(host(policy), [
			{ id: 9, name: "VPN", reason: "list", entries: ["198.51.100.0/24"] },
		]);
		expect(data.known_country_codes).toHaveLength(250);
		expect(data.details.map((rule) => rule.source_type)).toEqual(["manual", "list", "country", "country_unknown"]);
	});

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
