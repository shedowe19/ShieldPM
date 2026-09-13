import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

describe("GoAccess GeoIP discovery during startup", () => {
	let directory;
	let preload;
	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-geoip-"));
		preload = path.join(directory, "filesystem.cjs");
		// Redirect only the fixed deployment root; existence and size checks use real files.
		fs.writeFileSync(
			preload,
			`const fs = require('node:fs');
for (const method of ['existsSync', 'statSync']) {
  const original = fs[method];
  fs[method] = (filename, ...args) => original(
    typeof filename === 'string' && filename.startsWith('/data/')
      ? process.env.SHIELDPM_TEST_DATA + filename.slice(5) : filename, ...args);
}
`,
		);
	});
	afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
	const database = (relative, content = "GeoIP fixture") => {
		const filename = path.join(directory, relative);
		fs.mkdirSync(path.dirname(filename), { recursive: true });
		fs.writeFileSync(filename, content);
	};
	const validate = (values = {}) =>
		spawnSync(process.execPath, ["--require", preload, backendSourcePath("validate-env.cjs")], {
			encoding: "utf8",
			env: { PATH: process.env.PATH, TZ: "UTC", SHIELDPM_TEST_DATA: directory, ...values },
		});
	const geoipArguments = (result) => {
		expect(result.status, result.stderr).toBe(0);
		return result.stdout.match(/--geoip-database=[^'\s]+/g) || [];
	};
	it("discovers all databases written by the installer and Compose GeoIP updater", () => {
		for (const kind of ["City", "Country", "ASN"]) database(`nginx/GeoLite2-${kind}.mmdb`);
		expect(geoipArguments(validate({ GOA: "true" }))).toEqual([
			"--geoip-database=/data/nginx/GeoLite2-City.mmdb",
			"--geoip-database=/data/nginx/GeoLite2-Country.mmdb",
			"--geoip-database=/data/nginx/GeoLite2-ASN.mmdb",
		]);
	});
	it("preserves each existing GoAccess database and falls back independently for missing or empty files", () => {
		for (const kind of ["City", "Country", "ASN"]) database(`nginx/GeoLite2-${kind}.mmdb`);
		database("goaccess/geoip/GeoLite2-City.mmdb");
		database("goaccess/geoip/GeoLite2-Country.mmdb", "");
		expect(geoipArguments(validate())).toEqual([
			"--geoip-database=/data/goaccess/geoip/GeoLite2-City.mmdb",
			"--geoip-database=/data/nginx/GeoLite2-Country.mmdb",
			"--geoip-database=/data/nginx/GeoLite2-ASN.mmdb",
		]);
	});
	it("does not append an absent or empty shared database", () => {
		database("nginx/GeoLite2-City.mmdb", "");
		expect(geoipArguments(validate())).toEqual([]);
	});
	it("retains an explicit GeoIP argument without discovering other databases", () => {
		database("nginx/GeoLite2-City.mmdb");
		const result = validate({ GOACLA: "--geoip-database=/custom/City.mmdb" });
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).not.toContain("export GOACLA=");
	});
	it("retains the actionable error for the obsolete etc/goaccess directory", () => {
		database("etc/goaccess/geoip/GeoLite2-City.mmdb");
		database("nginx/GeoLite2-City.mmdb");
		const result = validate();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("need to be moved from etc/goaccess/geoip");
	});
});
