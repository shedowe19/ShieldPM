import { describe, expect, it } from "vitest";
import utils from "../../lib/utils.js";
import { createPinnedLookup, parseCidrList, renderNginxConfig, validateFeedUrl } from "../../internal/firewall-policy.js";

describe("host firewall policy helpers", () => {
	it("parses, normalises and de-duplicates IPv4 and IPv6 CIDRs", () => {
		const result = parseCidrList("192.0.2.1\n192.0.2.1/32 # duplicate\n2001:0db8::/32\ninvalid\n");
		expect(result.cidrs).toEqual(["192.0.2.1/32", "2001:db8::/32"]);
		expect(result.invalid).toEqual(["invalid"]);
	});

	it("accepts only credential-free HTTPS feed URLs on the default port", () => {
		expect(validateFeedUrl("https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt")).toContain(
			"raw.githubusercontent.com",
		);
		expect(() => validateFeedUrl("http://example.test/list.txt")).toThrow("HTTPS");
		expect(() => validateFeedUrl("https://user:secret@example.test/list.txt")).toThrow("credentials");
		expect(() => validateFeedUrl("https://example.test:8443/list.txt")).toThrow("custom port");
	});

	it("pins both single-address and Happy-Eyeballs lookup callbacks", async () => {
		const addresses = [{ address: "203.0.113.42", family: 4 }, { address: "2001:db8::42", family: 6 }];
		const lookup = createPinnedLookup(addresses);
		await new Promise((resolve, reject) => lookup("example.test", {}, (error, address, family) => {
			if (error) reject(error);
			else {
				expect(address).toBe("203.0.113.42");
				expect(family).toBe(4);
				resolve();
			}
		}));
		await new Promise((resolve, reject) => lookup("example.test", { all: true }, (error, result) => {
			if (error) reject(error);
			else {
				expect(result).toEqual(addresses);
				resolve();
			}
		}));
	});

	it("renders global geo and map directives with trusted CIDR precedence", () => {
		const config = renderNginxConfig(
			[
				{
					id: 7,
					allow_cidrs: ["198.51.100.0/24"],
					block_cidrs: ["203.0.113.0/24"],
					geo_mode: "allow",
					geo_countries: ["DE", "AT"],
				},
			],
			false,
		);
		expect(config).toContain("variables_hash_max_size 2048;");
		expect(config).toContain("variables_hash_bucket_size 128;");
		expect(config).toContain('map "" $shieldpm_geoip_country_code');
		expect(config).toContain('    default "";');
		const geoConfig = renderNginxConfig([{ id: 8, allow_cidrs: [], block_cidrs: [], geo_mode: "block", geo_countries: ["GB"] }], true);
		expect(geoConfig).toContain("    default $geoip2_country_code;");
		for (const language of ["bg", "de", "en", "es", "it", "ja", "ko", "nl", "pl", "ru", "sk", "vi", "zh"]) {
			expect(geoConfig).toContain(`map $shieldpm_geoip_country_code $shieldpm_geoip_country_name_${language}`);
		}
		expect(geoConfig).toContain('GB "Vereinigtes Königreich";');
		expect(geoConfig).toContain('GB "United Kingdom";');
		expect(geoConfig).toContain('GB "英国";');
		expect(config).toContain("geo $shieldpm_firewall_7_allow");
		expect(config).toContain("198.51.100.0/24 1;");
		expect(config).toContain("include /data/nginx/firewall/policy-7.cidrs;");
		expect(config).toContain('"~^1:" 0;');
		expect(config).toContain('"~^0:1:" 1;');
		expect(config).toContain('map "$shieldpm_firewall_7_allow:$shieldpm_firewall_7_cidr_block:$shieldpm_firewall_7_geo_block" $shieldpm_firewall_7_block_reason');
		expect(config).toContain('"~^0:0:1$" "country";');
	});

	it("injects a host policy check before the existing access handlers", async () => {
		const rendered = await utils.getRenderEngine().renderFile("proxy_host.conf", {
			id: 7,
			domain_names: ["firewall.example.test"],
			enabled: true,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 8080,
			access_list_id: 0,
			access_list: { meta: {}, items: [], clients: [] },
			firewall_policy_id: 4,
			firewall_policy: { enabled: true, action: "deny" },
			locations: [],
		});
		expect(rendered).toContain("ngx.var.shieldpm_firewall_4_blocked == \"1\"");
		expect(rendered).toContain("isAcmeChallenge");
		expect(rendered).toContain("ngx.exec(\"/_shieldpm_firewall_denied\")");
		expect(rendered).toContain("if ngx.var.uri == \"/_shieldpm_firewall_denied\" then");
		expect(rendered).toContain("location = /_shieldpm_firewall_denied");
		expect(rendered).toContain('set $shieldpm_firewall_policy_id "4";');
		expect(rendered).toContain("content_by_lua_file /usr/local/share/shieldpm/firewall_blocked_page.lua;");
		const denyPage = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../../../rootfs/usr/local/share/shieldpm/firewall_blocked_page.lua", import.meta.url), "utf8"));
		expect(denyPage).toContain("GEOIP-LÄNDERSPERRE");
		expect(denyPage).toContain("shieldpm_geoip_country_name_");
		expect(denyPage).toContain("GEOIP COUNTRY RULE");
		for (const language of ["bg", "de", "en", "es", "it", "ja", "ko", "nl", "pl", "ru", "sk", "vi", "zh"]) {
			expect(denyPage).toContain(`${language} = {`);
		}
	});

	it("keeps drop policies connectionless and omits the explanatory page", async () => {
		const rendered = await utils.getRenderEngine().renderFile("proxy_host.conf", {
			id: 7,
			domain_names: ["drop.example.test"],
			enabled: true,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 8080,
			access_list_id: 0,
			access_list: { meta: {}, items: [], clients: [] },
			firewall_policy_id: 4,
			firewall_policy: { enabled: true, action: "drop" },
			locations: [],
		});
		expect(rendered).toContain("ngx.exit(444)");
		expect(rendered).not.toContain("location = /_shieldpm_firewall_denied");
	});
});
