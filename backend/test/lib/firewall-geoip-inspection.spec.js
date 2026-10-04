import { describe, expect, it } from "vitest";
import { getFirewallGeoipStatus, inspectGeoipConfiguration } from "../../lib/firewall-geoip.js";

const statusFor = (configuration) =>
	getFirewallGeoipStatus({
		fileSystem: {
			readFile: async () => configuration,
			stat: async () => ({ isFile: () => true, size: 10 }),
		},
	});

describe("GeoIP readiness configuration contexts", () => {
	it("rejects a stream-only country variable even when its database exists", async () => {
		const configuration = `
load_module modules/ngx_stream_geoip2_module.so;
stream {
    geoip2 /private/database.mmdb {
        $geoip2_country_code source=$remote_addr country iso_code;
    }
}
http {}
`;
		expect(inspectGeoipConfiguration(configuration).databasePath).toBeNull();
		expect(await statusFor(configuration)).toMatchObject({ available: false });
	});

	it("ignores apparent GeoIP directives inside quoted configuration data", async () => {
		const configuration = `
http {
    map $host $example_text {
        default "
geoip2 /private/database.mmdb {
    $geoip2_country_code source=$remote_addr country iso_code;
}
";
    }
}
`;
		expect(inspectGeoipConfiguration(configuration).databasePath).toBeNull();
		expect(await statusFor(configuration)).toMatchObject({ available: false });
	});

	it("rejects a second source that would independently trust a request header", async () => {
		const configuration = `
load_module modules/ngx_http_geoip2_module.so;
http {
    geoip2 /private/database.mmdb {
        $geoip2_country_code source=$remote_addr source=$http_x_forwarded_for country iso_code;
    }
}
`;
		expect(inspectGeoipConfiguration(configuration).databasePath).toBeNull();
		expect(await statusFor(configuration)).toMatchObject({ available: false });
	});

	it("accepts a country variable from the HTTP database and keeps its path private", async () => {
		const configuration = `
load_module modules/ngx_http_geoip2_module.so;
http {
    geoip2 /private/database.mmdb {
        auto_reload 1h;
        $geoip2_country_code default=XX source=$remote_addr country iso_code;
    }
}
`;
		expect(inspectGeoipConfiguration(configuration).databasePath).toBe("/private/database.mmdb");
		const status = await statusFor(configuration);
		expect(status).toMatchObject({
			available: true,
			module_enabled: true,
			database_present: true,
			reason: null,
		});
		expect(JSON.stringify(status)).not.toContain("/private/");
	});
	it("rejects a real country as the default for unknown IPs", async () => {
		expect(
			await statusFor(
				'http { geoip2 "/private/country.mmdb" { $geoip2_country_code default=DE source=$remote_addr country iso_code; } }',
			),
		).toMatchObject({ available: false, reason: "country_variable_missing" });
	});
	it.each([false, true])(
		"rejects a later country variable override across database blocks: %s",
		async (separateBlock) => {
			const override = "$geoip2_country_code default=DE source=$http_x_forwarded_for country iso_code;";
			const configuration = `http {
			geoip2 /private/safe.mmdb {
				$geoip2_country_code default=XX source=$remote_addr country iso_code;
				${separateBlock ? "" : override}
			}
			${separateBlock ? `geoip2 /private/other.mmdb { ${override} }` : ""}
		}`;
			expect(await statusFor(configuration)).toMatchObject({
				available: false,
				reason: "country_variable_missing",
			});
		},
	);
	it.each([
		"http { geoip2 /private/country.mmdb { $geoip2_country_code source=$remote_addr country iso_code; }",
		"http { geoip2 /private/country.mmdb { $geoip2_country_code source=$remote_addr country iso_code } }",
		"http {} }",
	])("rejects structurally incomplete configuration without exposing its contents: %s", async (configuration) => {
		expect(await statusFor(configuration)).toMatchObject({
			available: false,
			module_enabled: false,
			database_present: false,
			reason: "configuration_unavailable",
		});
	});
});
