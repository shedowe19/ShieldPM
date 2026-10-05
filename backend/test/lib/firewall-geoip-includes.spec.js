import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFirewallGeoipStatus, inspectGeoipConfiguration } from "../../lib/firewall-geoip.js";

let directory;
let master;
const country = (database, source = "$remote_addr", name = "$geoip2_country_code") =>
	`geoip2 "${database}" { ${name} default=XX source=${source} country iso_code; }`;
const write = async (filename, content) => {
	const destination = path.join(directory, filename);
	await fs.mkdir(path.dirname(destination), { recursive: true });
	await fs.writeFile(destination, content);
	return destination;
};
const status = () => getFirewallGeoipStatus({ masterConfig: master });
const expectAvailable = async () => expect(await status()).toMatchObject({ available: true, reason: null });
const expectUnavailable = async (reason = "country_variable_missing") => {
	const result = await status();
	expect(result).toMatchObject({ available: false, reason });
	expect(JSON.stringify(result)).not.toContain(directory);
};

describe("effective HTTP GeoIP configuration including files", () => {
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-geoip-includes-"));
		master = path.join(directory, "nginx.conf");
		await write("country.mmdb", "nonempty test database");
	});
	afterEach(async () => fs.rm(directory, { recursive: true, force: true }));

	it("uses the master's conf_prefix for every relative include, including a nested child", async () => {
		await write("nginx.conf", "http { include parts/entry.conf; }");
		await write("parts/entry.conf", "include country.conf;");
		await write("country.conf", country(path.join(directory, "country.mmdb")));
		await write("parts/country.conf", country(path.join(directory, "country.mmdb"), "$http_x_country"));
		await expectAvailable();
	});

	it("rejects a later included GeoIP definition even when the master definition is safe", async () => {
		await write(
			"nginx.conf",
			`http { ${country(path.join(directory, "country.mmdb"))} include parts/override.conf; }`,
		);
		await write("parts/override.conf", country(path.join(directory, "other.mmdb"), "$http_x_country"));
		await expectUnavailable();
	});

	it("counts each repeated include as a separate definition", async () => {
		await write("nginx.conf", "http { include country.conf; include country.conf; }");
		await write("country.conf", country(path.join(directory, "country.mmdb")));
		await expectUnavailable();
	});

	it.each([false, true])("rejects an include cycle with a symlink alias: %s", async (symlink) => {
		await write("nginx.conf", "http { include parts/entry.conf; }");
		await write("parts/entry.conf", `include ${symlink ? "alias.conf" : "parts/../nginx.conf"};`);
		if (symlink) await fs.symlink(master, path.join(directory, "alias.conf"));
		await expectUnavailable("configuration_unavailable");
	});

	it("limits include depth while keeping configuration text and filenames private", async () => {
		await write("nginx.conf", "http { include nested0.conf; }");
		for (let index = 0; index < 33; index++) await write(`nested${index}.conf`, `include nested${index + 1}.conf;`);
		await expectUnavailable("configuration_unavailable");
	});

	it("accepts unmatched wildcard includes but rejects missing explicit includes", async () => {
		const safe = country(path.join(directory, "country.mmdb"));
		await write("nginx.conf", `http { ${safe} include missing/*.conf; }`);
		await expectAvailable();
		await write("nginx.conf", `http { ${safe} include missing/explicit.conf; }`);
		await expectUnavailable("configuration_unavailable");
	});

	it("does not let an included file close its caller's HTTP scope", async () => {
		await write("nginx.conf", `http { ${country(path.join(directory, "country.mmdb"))} include escape.conf; }`);
		await write("escape.conf", "} http {");
		await expectUnavailable("configuration_unavailable");
	});

	it("uses libc glob dotfile behavior and POSIX character classes", async () => {
		const safe = country(path.join(directory, "country.mmdb"));
		await write("parts/.hidden.conf", country(path.join(directory, "other.mmdb"), "$http_x_country"));
		await write("parts/file1.conf", "# harmless");
		await write("parts/filex.conf", country(path.join(directory, "other.mmdb"), "$http_x_country"));
		await write("nginx.conf", `http { ${safe} include parts/file[[:digit:]].conf; }`);
		await expectAvailable();
		await write("nginx.conf", `http { ${safe} include parts/.*.conf; }`);
		await expectUnavailable();
	});

	it("treats ** as one wildcard segment rather than recursive globstar", async () => {
		const safe = country(path.join(directory, "country.mmdb"));
		await write("parts/one/rule1.conf", "# harmless");
		await write("parts/one/deep/rule2.conf", country(path.join(directory, "other.mmdb"), "$http_x_country"));
		await write("nginx.conf", `http { ${safe} include parts/**/rule?.conf; }`);
		await expectAvailable();
	});

	it("omits nonexistent literal suffixes after wildcard directories", async () => {
		await write("parts/one/country.conf", country(path.join(directory, "country.mmdb")));
		await write("parts/two/other.conf", "# harmless");
		await write("parts/regular-file", "# not a directory");
		await write("nginx.conf", "http { include parts/*/country.conf; }");
		await expectAvailable();
	});

	it("retains dangling symlink glob matches as an unreadable configuration", async () => {
		await fs.mkdir(path.join(directory, "parts"));
		await fs.symlink(path.join(directory, "missing.conf"), path.join(directory, "parts/dangling.conf"));
		await write("nginx.conf", `http { ${country(path.join(directory, "country.mmdb"))} include parts/*.conf; }`);
		await expectUnavailable("configuration_unavailable");
	});

	it("resolves symlinks before .. in wildcard directory paths", async () => {
		await fs.mkdir(path.join(directory, "elsewhere/nested"), { recursive: true });
		await write("elsewhere/good/country.conf", country(path.join(directory, "country.mmdb")));
		await write("parts/poison/country.conf", country(path.join(directory, "other.mmdb"), "$http_x_country"));
		await fs.symlink(path.join(directory, "elsewhere/nested"), path.join(directory, "parts/link"));
		await write("nginx.conf", "http { include parts/link/../*/country.conf; }");
		await expectAvailable();
	});

	it("does not manufacture a glob match by normalizing nonexistent/..", async () => {
		await write("parts/poison/country.conf", country(path.join(directory, "other.mmdb"), "$http_x_country"));
		await write(
			"nginx.conf",
			`http { ${country(path.join(directory, "country.mmdb"))} include parts/missing/../*/country.conf; }`,
		);
		await expectAvailable();
	});

	it("counts aliases matched by a wildcard and parent traversal separately", async () => {
		await fs.mkdir(path.join(directory, "parts/one"), { recursive: true });
		await fs.mkdir(path.join(directory, "parts/two"), { recursive: true });
		await write("parts/country.conf", country(path.join(directory, "country.mmdb")));
		await write("nginx.conf", "http { include parts/*/../country.conf; }");
		await expectUnavailable();
	});

	it.each(["{a,b}", "!(a)", "a[bad"])("keeps shell expansion syntax literal: %s", async (name) => {
		const safe = country(path.join(directory, "country.mmdb"));
		await write(`parts/${name}1.conf`, country(path.join(directory, "other.mmdb"), "$http_x_country"));
		await write("nginx.conf", `http { ${safe} include "parts/${name}*.conf"; }`);
		await expectUnavailable();
	});

	it("uses wildcard escapes in fixed directory components as libc glob does", async () => {
		const safe = country(path.join(directory, "country.mmdb"));
		await write("parts space/override.conf", country(path.join(directory, "other.mmdb"), "$http_x_country"));
		await write("nginx.conf", `http { ${safe} include "parts\\\\ space/*.conf"; }`);
		await expectUnavailable();
	});

	it("preserves Nginx's unknown escapes so libc glob loads a quoted literal bracket", async () => {
		await write("parts/[a].conf", country(path.join(directory, "other.mmdb"), "$http_x_country"));
		await write("parts/a.conf", "# the unescaped class would match this harmless file");
		await write(
			"nginx.conf",
			`http { ${country(path.join(directory, "country.mmdb"))} include "parts/\\[a].conf"; }`,
		);
		await expectUnavailable();
	});

	it.each([
		"map $http_x_country $GEOIP2_COUNTRY_CODE { default SE; }",
		"geo $GEOIP2_COUNTRY_CODE { default SE; }",
		"split_clients $request_id $GEOIP2_COUNTRY_CODE { * SE; }",
		"server { set $GEOIP2_COUNTRY_CODE $http_x_country; }",
		"server { location / { auth_request_set $GEOIP2_COUNTRY_CODE $http_x_country; } }",
		"server { set_by_lua_block $GEOIP2_COUNTRY_CODE { return 'SE' } }",
	])("rejects another case-insensitive HTTP country writer: %s", async (writer) => {
		await write("nginx.conf", `http { ${country(path.join(directory, "country.mmdb"))} include writer.conf; }`);
		await write("writer.conf", writer);
		await expectUnavailable();
	});

	it("checks writers in server-scope includes and permits readonly uses of the country variable", async () => {
		const safe = country(path.join(directory, "country.mmdb"));
		await write(
			"nginx.conf",
			`http { ${safe} map $geoip2_country_code $other { default XX; } server { include writer.conf; } }`,
		);
		await write("writer.conf", "set $GEOIP2_COUNTRY_CODE $http_x_country;");
		await expectUnavailable();
		await write("writer.conf", "set $other_country $geoip2_country_code;");
		await expectAvailable();
	});

	it("keeps stream and HTTP variable namespaces independent", async () => {
		await write(
			"nginx.conf",
			`stream { ${country("/stream.mmdb", "$http_x_country")} map $test $geoip2_country_code { default SE; } } http { ${country(path.join(directory, "country.mmdb"))} }`,
		);
		await expectAvailable();
	});

	it("accepts uppercase spelling of the single trusted HTTP country variable", async () => {
		await write(
			"nginx.conf",
			`http { ${country(path.join(directory, "country.mmdb"), "$REMOTE_ADDR", "$GEOIP2_COUNTRY_CODE")} }`,
		);
		await expectAvailable();
	});

	it("keeps Lua strings, long strings and comments opaque inside ordinary host configuration", async () => {
		await write("nginx.conf", `http { ${country(path.join(directory, "country.mmdb"))} include host.conf; }`);
		await write(
			"host.conf",
			String.raw`server {
 location / {
  content_by_lua_block {
   -- someone's unmatched quote ' and closing brace }
   local data = [=[ quoted ' } " { ]] ]=]
   --[==[ comment with } ' { ]==]
   local table = { value = "safe\\\"quoted" }
   ngx.say(data)
  }
 }
}`,
		);
		await expectAvailable();
	});

	it("streams a generated 200000-CIDR table without counting its body against inspection limits", async () => {
		await write("nginx.conf", `http { ${country(path.join(directory, "country.mmdb"))} include large-host.conf; }`);
		const rows = Array.from(
			{ length: 200000 },
			(_, index) => `2001:db8:${(index >> 16).toString(16)}:${(index & 65535).toString(16)}::/64 1;`,
		).join("\n");
		await write("large-host.conf", `geo $other { default 0;\n${rows}\n}\nserver { location / { return 200; } }`);
		await expectAvailable();
	});

	it("bounds quoted and escaped tokens as well as ordinary words", () => {
		for (const token of [`"${"x".repeat(1024 * 1024 + 1)}"`, "\\x".repeat(1024 * 1024 + 1)]) {
			expect(() => inspectGeoipConfiguration(`http { set $other ${token}; }`)).toThrow();
		}
	});

	it("rejects a nonregular configuration before opening it", async () => {
		const open = vi.fn();
		const result = await getFirewallGeoipStatus({
			fileSystem: { open, stat: async () => ({ isFile: () => false, size: 0 }) },
		});
		expect(result.reason).toBe("configuration_unavailable");
		expect(open).not.toHaveBeenCalled();
	});
});
