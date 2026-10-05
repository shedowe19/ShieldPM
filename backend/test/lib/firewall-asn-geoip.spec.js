import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	assertAsnFirewallAvailable,
	assertCountryFirewallAvailable,
	getFirewallGeoipStatus,
	inspectGeoipConfiguration,
} from "../../lib/firewall-geoip.js";

const database = "/data/nginx/GeoLite2-ASN.mmdb";
const number = "$spm_geoip2_asn default=0 source=$remote_addr autonomous_system_number;";
const organization = "$spm_geoip2_asn_org source=$remote_addr autonomous_system_organization;";
const asnBlock = (filename = database, directives = `${number} ${organization}`) =>
	`geoip2 "${filename}" { auto_reload 5m; ${directives} }`;
const countryBlock =
	"geoip2 /data/nginx/GeoLite2-Country.mmdb { $geoip2_country_code default=XX source=$remote_addr country iso_code; }";
const publicStatus = (available, reason = null, present = true) => ({
	available,
	module_enabled: true,
	database_present: present,
	reason,
});
const statusFor = async (configuration, files = [database]) => {
	const fileSystem = {
		readFile: vi.fn(async () => configuration),
		stat: vi.fn(async (filename) => ({
			isFile: () => files.includes(filename),
			size: files.includes(filename) ? 12 : 0,
		})),
	};
	return { status: await getFirewallGeoipStatus({ fileSystem }), fileSystem };
};

describe("independent shared ASN and organization readiness", () => {
	it("reports ASN support without requiring a country definition or exposing the database path", async () => {
		const { status } = await statusFor(`http { ${asnBlock()} }`);
		expect(status).toEqual({
			...publicStatus(false, "country_variable_missing", false),
			asn: publicStatus(true),
		});
		expect(JSON.stringify(status)).not.toMatch(/\/data\/|\.mmdb|remote_addr|spm_geoip2/);
	});
	it("keeps country and ASN capabilities independent in both directions", async () => {
		const countryFile = "/data/nginx/GeoLite2-Country.mmdb";
		const { status } = await statusFor(`http { ${countryBlock} ${asnBlock()} }`, [countryFile, database]);
		expect(status).toEqual({ ...publicStatus(true), asn: publicStatus(true) });
		const countryOnly = await statusFor(`http { ${countryBlock} }`, [countryFile]);
		expect(countryOnly.status).toEqual({
			...publicStatus(true),
			asn: publicStatus(false, "asn_variable_missing", false),
		});
		const asnOnly = await statusFor(`http { ${asnBlock()} }`);
		expect(asnOnly.status.asn.available).toBe(true);
		expect(asnOnly.status.available).toBe(false);
	});
	it("reports an existing standard ASN file with the module disabled without enabling ASN filtering", async () => {
		const { status } = await statusFor("# load_module modules/ngx_http_geoip2_module.so;\nhttp {}");
		expect(status.asn).toEqual({
			available: false,
			module_enabled: false,
			database_present: true,
			reason: "module_disabled",
		});
	});
	it("checks the actual configured ASN database and never substitutes another nonempty file", async () => {
		const { status } = await statusFor(`http { ${asnBlock("/private/missing.mmdb")} }`);
		expect(status.asn).toEqual(publicStatus(false, "database_missing", false));
	});
	it("rejects a relative ASN database rather than consulting the backend working directory", async () => {
		const { status, fileSystem } = await statusFor(`http { ${asnBlock("asn.mmdb")} }`, ["asn.mmdb"]);
		expect(status.asn).toEqual(publicStatus(false, "database_missing", false));
		expect(fileSystem.stat).not.toHaveBeenCalledWith("asn.mmdb");
	});
	it.each(["", "default=0", '"default="'])("accepts only an unknown ASN default: %s", async (defaultValue) => {
		const directive = `$SPM_GEOIP2_ASN ${defaultValue} source=$REMOTE_ADDR autonomous_system_number;`;
		const { status } = await statusFor(`http { ${asnBlock(database, `${directive} ${organization}`)} }`);
		expect(status.asn.available).toBe(true);
	});
	it.each([
		["positive ASN default", number.replace("default=0", "default=13335"), organization],
		["invalid ASN default", number.replace("default=0", "default=unknown"), organization],
		["duplicate ASN defaults", number.replace("default=0", "default=0 default=0"), organization],
		["fixed organization default", number, organization.replace("source=", "default=Provider source=")],
		["embedded ASN quote default", number.replace("default=0", 'default="0"'), organization],
		["embedded organization quote default", number, organization.replace("source=", 'default="" source=')],
		["duplicate organization defaults", number, organization.replace("source=", '"default=" "default=" source=')],
		["header-based ASN source", number.replace("$remote_addr", "$http_x_forwarded_for"), organization],
		["header-based organization source", number, organization.replace("$remote_addr", "$http_x_asn")],
		["missing ASN source", number.replace("source=$remote_addr", ""), organization],
		["missing organization source", number, organization.replace("source=$remote_addr", "")],
		[
			"duplicate ASN sources",
			number.replace("source=$remote_addr", "source=$remote_addr source=$http_x_asn"),
			organization,
		],
		[
			"duplicate organization sources",
			number,
			organization.replace("source=$remote_addr", "source=$remote_addr source=$remote_addr"),
		],
		["wrong ASN lookup", number.replace("autonomous_system_number", "country iso_code"), organization],
		[
			"wrong organization lookup",
			number,
			organization.replace("autonomous_system_organization", "autonomous_system_number"),
		],
		["missing ASN number", "", organization],
		["missing organization", number, ""],
		["repeated ASN number", `${number} ${number}`, organization],
		["repeated organization", number, `${organization} ${organization}`],
	])("rejects %s without affecting safe country support", async (_name, asn, org) => {
		const { status } = await statusFor(`http { ${countryBlock} ${asnBlock(database, `${asn} ${org}`)} }`, [
			database,
			"/data/nginx/GeoLite2-Country.mmdb",
		]);
		expect(status.available).toBe(true);
		expect(status.asn).toEqual(publicStatus(false, "asn_variable_missing"));
	});
	it("requires both lookups in the same block even when separate blocks reference the same database", async () => {
		const { status } = await statusFor(
			`http { ${asnBlock(database, number)} ${asnBlock(database, organization)} }`,
		);
		expect(status.asn.reason).toBe("asn_variable_missing");
	});
	it.each(["$spm_geoip2_asn", "$spm_geoip2_asn_org"])("rejects later writers of %s", async (name) => {
		for (const writer of [
			`map $http_x_test ${name} { default 13335; }`,
			`geo ${name} { default 13335; }`,
			`split_clients $request_id ${name} { * 13335; }`,
			`server { set ${name.toUpperCase()} $http_x_test; }`,
			`server { location / { auth_request_set ${name} $upstream_http_test; } }`,
			`server { set_by_lua_block ${name} { return "13335" } }`,
		]) {
			const { status } = await statusFor(`http { ${asnBlock()} ${writer} }`);
			expect(status.asn.reason, writer).toBe("asn_variable_missing");
		}
	});
	it("ignores a same-named writer in the separate stream variable namespace", async () => {
		const { status } = await statusFor(
			`http { ${asnBlock()} } stream { map $remote_addr $spm_geoip2_asn { default 1; } }`,
		);
		expect(status.asn.available).toBe(true);
	});
	it("rejects stream-only ASN definitions", async () => {
		const { status } = await statusFor(`load_module modules/ngx_stream_geoip2_module.so; stream { ${asnBlock()} }`);
		expect(status.asn.available).toBe(false);
	});
	it("keeps ASN available when an unrelated writer invalidates the country variable", async () => {
		const { status } = await statusFor(
			`http { ${countryBlock} ${asnBlock()} server { set $geoip2_country_code DE; } }`,
		);
		expect(status.reason).toBe("country_variable_missing");
		expect(status.asn.available).toBe(true);
	});
	it("fails both capabilities closed on unreadable or malformed configuration", async () => {
		const { status } = await statusFor(`http { ${asnBlock()} private unfinished`);
		const unavailable = { ...publicStatus(false, "configuration_unavailable", false), module_enabled: false };
		expect(status).toEqual({ ...unavailable, asn: unavailable });
		expect(JSON.stringify(status)).not.toContain("private");
	});
	it("returns one private ASN path only for the matching paired definition", () => {
		expect(inspectGeoipConfiguration(`http { ${asnBlock()} }`).asnDatabasePath).toBe(database);
		expect(inspectGeoipConfiguration(`http { ${asnBlock(database, number)} }`).asnDatabasePath).toBeNull();
	});
});

describe("ASN readiness across actual include files", () => {
	let directory;
	afterEach(async () => {
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	it.each([false, true])("checks included server-level ASN/organization overrides: organization=%s", async (org) => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-asn-readiness-"));
		const localDatabase = path.join(directory, "asn.mmdb");
		const masterConfig = path.join(directory, "nginx.conf");
		await fs.writeFile(localDatabase, "nonempty structural readiness fixture");
		await fs.writeFile(masterConfig, "http { include asn.conf; server { include override.conf; } }");
		await fs.writeFile(path.join(directory, "asn.conf"), asnBlock(localDatabase));
		await fs.writeFile(path.join(directory, "override.conf"), "# harmless");
		expect((await getFirewallGeoipStatus({ masterConfig })).asn.available).toBe(true);
		const output = org ? "$SPM_GEOIP2_ASN_ORG" : "$SPM_GEOIP2_ASN";
		await fs.writeFile(path.join(directory, "override.conf"), `set ${output} $http_x_asn;`);
		const status = await getFirewallGeoipStatus({ masterConfig });
		expect(status.asn.reason).toBe("asn_variable_missing");
		expect(JSON.stringify(status)).not.toContain(directory);
	});
	it("counts repeated included ASN definitions rather than deduplicating the database file", async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-asn-readiness-"));
		const localDatabase = path.join(directory, "asn.mmdb");
		const masterConfig = path.join(directory, "nginx.conf");
		await fs.writeFile(localDatabase, "nonempty structural readiness fixture");
		await fs.writeFile(path.join(directory, "asn.conf"), asnBlock(localDatabase));
		await fs.writeFile(masterConfig, "http { include asn.conf; include asn.conf; }");
		expect((await getFirewallGeoipStatus({ masterConfig })).asn.reason).toBe("asn_variable_missing");
	});
});

describe("independent ASN and country policy assertions with one supplied status", () => {
	it("allows ASN rules while country support is unavailable", async () => {
		const status = { ...publicStatus(false, "country_variable_missing", false), asn: publicStatus(true) };
		await expect(
			assertAsnFirewallAvailable({ enabled: true, asn_denylist: [{ asn: 13335 }] }, status),
		).resolves.toBeUndefined();
		await expect(
			assertCountryFirewallAvailable({ enabled: true, country_denylist: ["DE"] }, status),
		).rejects.toThrow("country_variable_missing");
	});
	it("allows country rules while ASN support is unavailable", async () => {
		const status = { ...publicStatus(true), asn: publicStatus(false, "database_missing", false) };
		await expect(
			assertCountryFirewallAvailable({ enabled: true, block_unknown_country: true }, status),
		).resolves.toBeUndefined();
		await expect(
			assertAsnFirewallAvailable({ enabled: true, asn_denylist: [{ asn: 13335 }] }, status),
		).rejects.toThrow("database_missing");
	});
	it("fails ASN rules closed when an older supplied status lacks the ASN capability", async () => {
		await expect(
			assertAsnFirewallAvailable({ enabled: true, asn_denylist: [{ asn: 1 }] }, publicStatus(true)),
		).rejects.toThrow("configuration_unavailable");
	});
	it.each([
		undefined,
		{ enabled: false, asn_denylist: [{ asn: 13335 }] },
		{ enabled: true },
		{ enabled: true, asn_denylist: [] },
	])("does not inspect capabilities for inactive or empty ASN policies: %j", async (policy) => {
		const suppliedStatus = {
			get asn() {
				throw new Error("Unexpected lookup");
			},
		};
		await expect(assertAsnFirewallAvailable(policy, suppliedStatus)).resolves.toBeUndefined();
	});
});
