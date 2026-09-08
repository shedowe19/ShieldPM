import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const validate = (values) =>
	spawnSync(process.execPath, [backendSourcePath("validate-env.cjs")], {
		encoding: "utf8",
		env: { PATH: process.env.PATH, TZ: "UTC", ...values },
	});

describe("startup network configuration", () => {
	it.each(["profile&value", "profile\nvalue", "profile/value"])(
		"rejects configuration delimiters in ACME profile %s",
		(profile) => {
			expect(validate({ ACME_PROFILE: profile }).status).toBe(1);
		},
	);
	it("compares actual listener ports even with leading zeros", () => {
		expect(validate({ HTTP_PORT: "080", HTTPS_PORT: "80" }).status).toBe(1);
	});
	it.each(["999.1.2.3", "1.2.3.999", "01.2.3.4"])("rejects invalid IPv4 binding %s", (address) => {
		expect(validate({ IPV4_BINDING: address }).status).toBe(1);
	});
	it.each(["[:::]", "[1:2:3]", "[::gg]"])("rejects invalid IPv6 binding %s", (address) => {
		expect(validate({ IPV6_BINDING: address }).status).toBe(1);
	});
	it("accepts uppercase and IPv4-embedded IPv6 bindings", () => {
		expect(validate({ IPV6_BINDING: "[2001:DB8::1]", NPM_IPV6_BINDING: "[::ffff:192.0.2.1]" }).status).toBe(0);
	});
	it.each(["0", "65536", "999999999999999999999999"])("rejects out-of-range listening port %s", (port) => {
		expect(validate({ NPM_PORT: port }).status).toBe(1);
	});
	it("accepts the highest valid port and supplies normal defaults", () => {
		const result = validate({ NPM_PORT: "65535" });
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("export HTTP_PORT='80'");
	});
});
