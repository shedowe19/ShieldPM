import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getFirewallGeoipStatus } from "../../lib/firewall-geoip.js";
import { ConfigurationLexer } from "../../lib/firewall-geoip-config.js";

const definitions = (directory = "/private") => `
geoip2 ${directory}/country.mmdb { $geoip2_country_code default=XX source=$remote_addr country iso_code; }
geoip2 ${directory}/asn.mmdb {
    $spm_geoip2_asn default=0 source=$remote_addr autonomous_system_number;
    $spm_geoip2_asn_org source=$remote_addr autonomous_system_organization;
}`;
const inlineStatus = (extra) =>
	getFirewallGeoipStatus({
		fileSystem: {
			readFile: async () => `http { ${definitions()} ${extra} }`,
			stat: async () => ({ isFile: () => true, size: 10 }),
		},
	});
const names = ["geoip2_country_code", "spm_geoip2_asn", "spm_geoip2_asn_org"];
const bracedVariable = "$" + "{safe_value}";
const forms = [(name) => `(?<${name}>[0-9]+)`, (name) => `(?'${name}'[0-9]+)`, (name) => `(?P<${name}>[0-9]+)`];
const writers = [
	(pattern) => `server { location ~ "^/${pattern}$" { return 200; } }`,
	(pattern) => `server { server_name "~^${pattern}\\.example$"; }`,
	(pattern) => `server { rewrite "^/${pattern}$" / break; }`,
	(pattern) => `server { if ($uri ~ "^/${pattern}$") { return 200; } }`,
	(pattern) => `map $uri $capture_probe { "~^/${pattern}$" hit; default none; }`,
	(pattern) => `server { location / { proxy_redirect "~^/${pattern}$" /; } }`,
	(pattern) => `server { location / { proxy_cookie_domain "~^${pattern}$" example.com; } }`,
	(pattern) => `server { location / { proxy_cookie_path "~^/${pattern}$" /; } }`,
	(pattern) => `server { location / { proxy_cookie_flags "~^${pattern}$" secure; } }`,
	(pattern) => `server { valid_referers "~^${pattern}$"; }`,
];

describe("named PCRE captures are GeoIP variable writers", () => {
	it.each(names)("rejects each PCRE capture spelling of %s in actual regex arguments", async (name) => {
		for (const form of forms) {
			for (const writer of writers) {
				const directive = writer(form(name.toUpperCase()));
				const status = await inlineStatus(directive);
				if (name === "geoip2_country_code") {
					expect(status.reason, directive).toBe("country_variable_missing");
					expect(status.asn.available, directive).toBe(true);
				} else {
					expect(status.available, directive).toBe(true);
					expect(status.asn.reason, directive).toBe("asn_variable_missing");
				}
			}
		}
	});
	it.each([
		'add_header X-Example "(?<spm_geoip2_asn>[0-9]+)";',
		'server { return 200 "(?P<geoip2_country_code>[A-Z]+)"; }',
		'server { set $example "(?<spm_geoip2_asn_org>anything)"; }',
		'# server { location ~ "(?<spm_geoip2_asn>[0-9]+)" { return 200; } }\n',
		'log_format example "(?P<geoip2_country_code>[A-Z]+)";',
		'map $uri $example { default "(?<spm_geoip2_asn>anything)"; }',
		'map $uri $example { "(?<spm_geoip2_asn>anything)" none; }',
		'map $uri $example { "" "~(?<spm_geoip2_asn>anything)"; }',
		'map $uri $example { default "~(?<spm_geoip2_asn>anything)"; # ~(?<spm_geoip2_asn>anything) ignored;\n }',
		`map $uri $example { default ${bracedVariable}; }`,
		'init_by_lua_block { local text = "(?<spm_geoip2_asn>anything)"; -- (?P<geoip2_country_code>anything)\n }',
		'server { location ~ "^/(?:safe)$" { return 200; } }',
		'server { location ~ "^/\\\\(?<spm_geoip2_asn>literal\\\\)$" { return 200; } }',
		'server { location ~ "^/[()spm_geoip2_asn?<>]+$" { return 200; } }',
		'server { location ~ "^/[](?<spm_geoip2_asn>]+$" { return 200; } }',
		'server { location ~ "^/[[:alnum:](?<spm_geoip2_asn>]+$" { return 200; } }',
		'server { location ~ "^/(?#(?<spm_geoip2_asn>)[0-9]+$" { return 200; } }',
		'server { location ~ "^/\\\\Q(?<spm_geoip2_asn>literal)\\\\E$" { return 200; } }',
	])("does not classify comments, literal text or regex literals as capture writers: %s", async (extra) => {
		const status = await inlineStatus(extra);
		expect(status.available).toBe(true);
		expect(status.asn.available).toBe(true);
	});
	it("keeps stream captures separate from HTTP variables", async () => {
		const status = await getFirewallGeoipStatus({
			fileSystem: {
				readFile: async () =>
					`http { ${definitions()} } stream { map $remote_addr $example { "~(?<spm_geoip2_asn>.+)" hit; } }`,
				stat: async () => ({ isFile: () => true, size: 10 }),
			},
		});
		expect(status.available).toBe(true);
		expect(status.asn.available).toBe(true);
	});
	it("keeps an unquoted regex hash literal rather than treating it as a configuration comment", async () => {
		const status = await inlineStatus("map $uri $example { ~#(?<spm_geoip2_asn>[0-9]+) hit; default none; }");
		expect(status.asn.reason).toBe("asn_variable_missing");
	});
	it("preserves embedded quotes in parameter words as Nginx does", () => {
		const lexer = new ConfigurationLexer();
		const words = Array.from(lexer.feed('example default="" "default=" default="0";'))[0].words;
		lexer.finish();
		expect(words).toEqual(["example", 'default=""', "default=", 'default="0"']);
	});
	it("scans quoted regex map keys and preserves chunk boundaries without building ordinary row arrays", () => {
		const lexer = new ConfigurationLexer({ mapTable: true });
		const rows =
			'default "(?<spm_geoip2_asn>literal)"; "" "~(?<spm_geoip2_asn>literal)"; "~(?<spm_geoip2_asn>real)" hit;';
		const events = [];
		for (const character of rows) events.push(...lexer.feed(character));
		lexer.finish();
		expect(events.map((event) => event.words)).toEqual([["~(?<spm_geoip2_asn>real)"]]);
	});
});

describe("streamed map regexes and map-entry includes", () => {
	let directory;
	afterEach(async () => {
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	const fixture = async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-geoip-map-"));
		await fs.writeFile(path.join(directory, "country.mmdb"), "nonempty structural fixture");
		await fs.writeFile(path.join(directory, "asn.mmdb"), "nonempty structural fixture");
		return path.join(directory, "nginx.conf");
	};
	it.each(names)("finds %s captures in nested includes inside map bodies", async (name) => {
		const masterConfig = await fixture();
		await fs.mkdir(path.join(directory, "parts"));
		await fs.writeFile(path.join(directory, "parts/entry.conf"), "include rows.conf;");
		await fs.writeFile(path.join(directory, "rows.conf"), `"~^/${forms[2](name)}$" hit;`);
		await fs.writeFile(
			masterConfig,
			`http { ${definitions(directory)} map $uri $example { include parts/entry.conf; default none; } }`,
		);
		const status = await getFirewallGeoipStatus({ masterConfig });
		expect(name === "geoip2_country_code" ? status.available : status.asn.available).toBe(false);
		expect(JSON.stringify(status)).not.toContain(directory);
	});
	it("keeps 200000 ordinary map rows opaque and checks a final regex row", async () => {
		const masterConfig = await fixture();
		const rows = Array.from({ length: 200000 }, (_, index) => `${index} "${"x".repeat(180)}";`).join("\n");
		await fs.writeFile(path.join(directory, "rows.conf"), `${rows}\n`);
		await fs.writeFile(
			masterConfig,
			`http { ${definitions(directory)} map $uri $example { include rows.conf; default none; } }`,
		);
		const safe = await getFirewallGeoipStatus({ masterConfig });
		expect(safe.available).toBe(true);
		expect(safe.asn.available).toBe(true);
		await fs.appendFile(path.join(directory, "rows.conf"), '"~(?<SPM_GEOIP2_ASN>.+)" hit;\n');
		expect((await getFirewallGeoipStatus({ masterConfig })).asn.available).toBe(false);
	});
});
