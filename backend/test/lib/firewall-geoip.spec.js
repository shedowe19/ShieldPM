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
