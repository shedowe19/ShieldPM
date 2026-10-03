import { describe, expect, it, vi } from "vitest";
import { getFirewallGeoipStatus, inspectGeoipConfiguration } from "../../lib/firewall-geoip.js";

const configuration = (
	path = "/data/nginx/GeoLite2-Country.mmdb",
	source = "$remote_addr",
) => `load_module modules/ngx_http_geoip2_module.so;
http {
geoip2 ${path} {
auto_reload 5m;
$geoip2_country_code default=XX source=${source} country iso_code;
}
}`;
const fileSystem = (content, files = []) => ({
	readFile: vi.fn(async () => content),
	stat: vi.fn(async (path) => ({ isFile: () => files.includes(path), size: files.includes(path) ? 19492 : 0 })),
});

describe("IP firewall reuse of existing Analytics GeoIP support", () => {
	it("reads the master configuration used by the Docker and native launch scripts", async () => {
		const database = "/data/nginx/GeoLite2-Country.mmdb";
		const fs = fileSystem("", [database]);
		fs.readFile.mockImplementation(async (path) =>
			path === "/usr/local/nginx/conf/nginx.conf"
				? configuration(database)
				: "# stale distribution configuration",
		);
		expect((await getFirewallGeoipStatus({ fileSystem: fs })).available).toBe(true);
		expect(fs.readFile).toHaveBeenCalledExactlyOnceWith("/usr/local/nginx/conf/nginx.conf", "utf8");
	});
	it("does not accept a stale distribution configuration when the active master cannot be read", async () => {
		const database = "/data/nginx/GeoLite2-Country.mmdb";
		const fs = fileSystem("", [database]);
		fs.readFile.mockImplementation(async (path) => {
			if (path === "/etc/nginx/nginx.conf") return configuration(database);
			throw new Error("Active master is unavailable");
		});
		expect((await getFirewallGeoipStatus({ fileSystem: fs })).reason).toBe("configuration_unavailable");
		expect(fs.readFile).toHaveBeenCalledExactlyOnceWith("/usr/local/nginx/conf/nginx.conf", "utf8");
		expect(fs.stat).not.toHaveBeenCalled();
	});
	it.each(["/data/nginx/GeoLite2-Country.mmdb", "/data/goaccess/geoip/GeoLite2-City.mmdb"])(
		"uses the configured nonempty database without downloading or exposing paths: %s",
		async (path) => {
			const fs = fileSystem(configuration(path), [path]);
			expect(await getFirewallGeoipStatus({ fileSystem: fs })).toEqual({
				available: true,
				module_enabled: true,
				database_present: true,
				reason: null,
			});
			expect(fs.stat).toHaveBeenCalledExactlyOnceWith(path);
		},
	);
	it("does not infer usable country filtering from a GoAccess database with the module commented out", async () => {
		const fs = fileSystem(
			configuration()
				.split("\n")
				.map((line) => `#${line}`)
				.join("\n"),
			["/data/goaccess/geoip/GeoLite2-Country.mmdb"],
		);
		expect(await getFirewallGeoipStatus({ fileSystem: fs })).toEqual({
			available: false,
			module_enabled: false,
			database_present: true,
			reason: "module_disabled",
		});
	});
	it("rejects a header-based country lookup even if its database exists", async () => {
		const fs = fileSystem(configuration(undefined, "$http_x_forwarded_for"), ["/data/nginx/GeoLite2-Country.mmdb"]);
		expect((await getFirewallGeoipStatus({ fileSystem: fs })).reason).toBe("country_variable_missing");
	});
	it("does not mistake a relative MMDB in the backend CWD for Nginx's runtime-prefix database", async () => {
		const fs = fileSystem(configuration("country.mmdb"), ["country.mmdb"]);
		expect(await getFirewallGeoipStatus({ fileSystem: fs })).toEqual({
			available: false,
			module_enabled: true,
			database_present: false,
			reason: "database_missing",
		});
		expect(fs.stat).not.toHaveBeenCalled();
	});
	it("reports an empty or absent configured database without accepting another database", async () => {
		const fs = fileSystem(configuration(), ["/data/nginx/GeoLite2-City.mmdb"]);
		expect((await getFirewallGeoipStatus({ fileSystem: fs })).reason).toBe("database_missing");
	});
	it("ignores a commented country variable and accepts an active static module configuration", () => {
		expect(
			inspectGeoipConfiguration(configuration().replace("$geoip2_country_code", "#$geoip2_country_code"))
				.databasePath,
		).toBe(null);
		expect(
			inspectGeoipConfiguration(configuration().replace("load_module modules/ngx_http_geoip2_module.so;", ""))
				.moduleEnabled,
		).toBe(true);
	});
	it("returns a bounded failure when the configuration cannot be read", async () => {
		const fs = fileSystem("");
		fs.readFile.mockRejectedValue(new Error("contains private configuration details"));
		expect(await getFirewallGeoipStatus({ fileSystem: fs })).toEqual({
			available: false,
			module_enabled: false,
			database_present: false,
			reason: "configuration_unavailable",
		});
	});
});
