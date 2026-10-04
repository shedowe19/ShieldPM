import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertConfiguredFirewallLookups, getFirewallGeoipStatus } from "../../lib/firewall-geoip.js";

const country = (database = "/private/country.mmdb") =>
	`geoip2 ${database} { $geoip2_country_code default=XX source=$remote_addr country iso_code; }`;
const asn = (database = "/private/asn.mmdb") => `geoip2 ${database} {
    $spm_geoip2_asn default=0 source=$remote_addr autonomous_system_number;
    $spm_geoip2_asn_org source=$remote_addr autonomous_system_organization;
}`;
const countryRule = "map $geoip2_country_code $spm_fw_1_country { default XX; GB GB; }";
const asnRule = "map $spm_geoip2_asn $spm_fw_2_asn_rule { default 0; 15169 1; }";
const optionsFor = (configuration, available = true) => ({
	fileSystem: {
		readFile: vi.fn(async () => configuration),
		stat: vi.fn(async () => ({ isFile: () => available, size: available ? 10 : 0 })),
	},
});

describe("required firewall lookups in the complete staged Nginx configuration", () => {
	it.each([`${country()} ${countryRule}`, `${asn()} ${asnRule}`, `${country()} ${asn()} ${countryRule} ${asnRule}`])(
		"accepts independent configured capabilities actually required by rules: %s",
		async (directives) => {
			const options = optionsFor(`http { ${directives} }`);
			await expect(assertConfiguredFirewallLookups(options)).resolves.toBeUndefined();
			expect(options.fileSystem.readFile).toHaveBeenCalledExactlyOnceWith(
				"/usr/local/nginx/conf/nginx.conf",
				"utf8",
			);
		},
	);
	it.each([
		"http {}",
		"http { geo $spm_fw_1_manual { default 0; 8.8.8.8 1; } map $spm_fw_1_manual $spm_fw_1_hit { default 0; 1 1; } }",
		"http { map $geoip2_country_code $spm_fw_1_country_info { default XX; } }",
		"http { map $spm_geoip2_asn $spm_fw_1_asn_info { default 0; } }",
		"stream { map $spm_geoip2_asn $spm_fw_1_asn_rule { default 0; } } http {}",
		'http { map $uri $example { default "map $spm_geoip2_asn $spm_fw_1_asn_rule { default 0; }"; } }',
	])(
		"does not require country/ASN databases for IP-only or optional metadata configurations: %s",
		async (configuration) => {
			const options = optionsFor(configuration, false);
			await expect(assertConfiguredFirewallLookups(options)).resolves.toBeUndefined();
			expect(options.fileSystem.stat).not.toHaveBeenCalled();
		},
	);
	it.each([
		[countryRule, "module_disabled"],
		[asnRule, "module_disabled"],
		["load_module modules/ngx_http_geoip2_module.so;", "unused"],
	])("guards only generated required lookups: %s", async (directive, reason) => {
		const configuration = reason === "unused" ? `${directive} http {}` : `http { ${directive} }`;
		if (reason === "unused")
			await expect(assertConfiguredFirewallLookups(optionsFor(configuration))).resolves.toBeUndefined();
		else await expect(assertConfiguredFirewallLookups(optionsFor(configuration))).rejects.toThrow(reason);
	});
	it.each([
		[`${country()} ${countryRule}`, "database_missing"],
		[`${asn()} ${asnRule}`, "database_missing"],
	])("rejects a missing database needed by an active generated lookup: %s", async (configuration, reason) => {
		await expect(assertConfiguredFirewallLookups(optionsFor(`http { ${configuration} }`, false))).rejects.toThrow(
			reason,
		);
	});
	it.each([
		[
			`${country()} ${countryRule} server { location ~ "(?P<geoip2_country_code>.+)" { return 200; } }`,
			"country_variable_missing",
		],
		[`${asn()} ${asnRule} server { location ~ "(?<SPM_GEOIP2_ASN>.+)" { return 200; } }`, "asn_variable_missing"],
		[`${asn()} ${asnRule} map $uri $example { "~(?'spm_geoip2_asn'.+)" hit; }`, "asn_variable_missing"],
		[`${asn()} ${asnRule} server { set $spm_geoip2_asn_org $http_x_org; }`, "asn_variable_missing"],
	])(
		"rejects a writer introduced by the candidate rather than trusting the previously active source: %s",
		async (configuration, reason) => {
			await expect(assertConfiguredFirewallLookups(optionsFor(`http { ${configuration} }`))).rejects.toThrow(
				reason,
			);
		},
	);
	it.each([
		`${country()} ${countryRule} ${asn().replace("source=$remote_addr", "source=$http_x_asn")}`,
		`${asn()} ${asnRule} ${country().replace("source=$remote_addr", "source=$http_x_country")}`,
	])("does not reject an unrelated unavailable GeoIP capability: %s", async (configuration) => {
		await expect(assertConfiguredFirewallLookups(optionsFor(`http { ${configuration} }`))).resolves.toBeUndefined();
	});
	it("rejects uninspectable configuration without exposing private source text", async () => {
		const options = optionsFor("http { private unfinished");
		await expect(assertConfiguredFirewallLookups(options)).rejects.toThrow("configuration_unavailable");
		await expect(assertConfiguredFirewallLookups(options)).rejects.not.toThrow("private");
	});
});

describe("staged includes across multiple firewall and ordinary hosts", () => {
	let directory;
	afterEach(async () => {
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	it.each([false, true])(
		"rejects a conflicting candidate affecting an existing host and accepts its rollback: ASN=%s",
		async (useAsn) => {
			directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-staged-geoip-"));
			const masterConfig = path.join(directory, "nginx.conf");
			const database = path.join(directory, useAsn ? "asn.mmdb" : "country.mmdb");
			await fs.writeFile(database, "nonempty structural database fixture");
			await fs.writeFile(
				masterConfig,
				`http { ${useAsn ? asn(database) : country(database)} include hosts/*.conf; }`,
			);
			await fs.mkdir(path.join(directory, "hosts"));
			await fs.writeFile(
				path.join(directory, "hosts/existing.conf"),
				`${useAsn ? asnRule : countryRule} server { location / { return 403; } }`,
			);
			await fs.writeFile(path.join(directory, "hosts/candidate.conf"), "server { location / { return 200; } }");
			const options = { masterConfig };
			const previous = await getFirewallGeoipStatus(options);
			expect(useAsn ? previous.asn.available : previous.available).toBe(true);
			await expect(assertConfiguredFirewallLookups(options)).resolves.toBeUndefined();
			const name = useAsn ? "spm_geoip2_asn" : "geoip2_country_code";
			await fs.writeFile(
				path.join(directory, "hosts/candidate.conf"),
				`server { location ~ "(?<${name}>.+)" { return 200; } }`,
			);
			await expect(assertConfiguredFirewallLookups(options)).rejects.toThrow(
				useAsn ? "asn_variable_missing" : "country_variable_missing",
			);
			await fs.writeFile(path.join(directory, "hosts/candidate.conf"), "server { location / { return 200; } }");
			await expect(assertConfiguredFirewallLookups(options)).resolves.toBeUndefined();
		},
	);
});
