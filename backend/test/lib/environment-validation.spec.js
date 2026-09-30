import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const validate = (values) =>
	spawnSync(process.execPath, [backendSourcePath("validate-env.cjs")], {
		encoding: "utf8",
		env: { PATH: process.env.PATH, TZ: "UTC", ...values },
	});

describe("startup network configuration", () => {
	it.each(["shortlived", "profile&value", "profile\nvalue", "profile/value"])(
		"ignores the removed ACME profile environment value %s",
		(profile) => {
			const result = validate({ ACME_PROFILE: profile });
			expect(result.status).toBe(0);
			expect(result.stdout).not.toContain("ACME_PROFILE");
		},
	);
	it("does not contact the CA during startup for an obsolete environment profile", () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-profile-validation-"));
		try {
			const trace = path.join(directory, "curl-trace");
			fs.writeFileSync(
				path.join(directory, "curl"),
				'#!/bin/sh\nprintf "%s\\n" "$@" > "$PROFILE_CURL_TRACE"\nprintf \'{"meta":{"profiles":{"shortlived":"supported"}}}\'\n',
				{ mode: 0o700 },
			);
			const result = validate({
				ACME_PROFILE: "shortlived",
				PATH: `${directory}:${process.env.PATH}`,
				PROFILE_CURL_TRACE: trace,
			});
			expect(result.status).toBe(0);
			expect(fs.existsSync(trace)).toBe(false);
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
	it.each([
		["ACME_SERVER", "invalid-url"],
		["ACME_KEY_TYPE", "invalid-key"],
		["ACME_SERVER_TLS_VERIFY", "invalid-boolean"],
	])("still validates %s after moving profiles to the UI", (key, value) => {
		expect(validate({ [key]: value, ACME_PROFILE: "shortlived" }).status).toBe(1);
	});
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
		expect(result.stdout).not.toContain("ACME_PROFILE");
	});
});
