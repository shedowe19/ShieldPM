import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	assertConfiguredFirewallLookups,
	getFirewallGeoipStatus,
} from "../../backend/lib/firewall-geoip.js";
import { normalizeFirewallPolicy } from "../../backend/lib/firewall-policy.js";
import { buildFirewallRender } from "../../backend/lib/firewall-render.js";
import utils from "../../backend/lib/utils.js";
import { resolveNginxSmokeModules } from "./nginx-smoke-modules.mjs";

const listen = (server) =>
	new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve(server.address().port));
	});
const close = (server) => new Promise((resolve) => server.close(resolve));
const quote = (value) =>
	`"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const temporaryPaths = (directory) =>
	["client_body", "proxy", "fastcgi", "uwsgi", "scgi"]
		.map((name) => `${name}_temp_path ${quote(path.join(directory, name))};`)
		.join("\n");
const escapeHtml = (value) =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
const oracle = async (database, addresses) =>
	JSON.parse(
		await utils.execFile("python3", [
			fileURLToPath(new URL("./mmdb-oracle.py", import.meta.url)),
			database,
			...addresses,
		]),
	);

async function asnProbe(database) {
	const bases = [
		"1.0.0",
		"1.128.0",
		"12.81.92",
		"23.0.0",
		"23.16.0",
		"27.0.0",
		"81.2.69",
		"89.160.20",
		"128.101.101",
		"216.160.83",
	];
	const addresses = bases.flatMap((base) =>
		Array.from({ length: 6 }, (_, offset) => `${base}.${offset}`),
	);
	const records = await oracle(database, [
		...addresses,
		"8.8.8.8",
		"1.1.1.1",
		"203.0.113.1",
		"2001:200::1",
		"2001:218::1",
		"2001:4860:4860::8888",
		"2001:4f8::1",
	]);
	const byAsn = new Map();
	for (const record of records.filter(
		(item) => item.asn && !item.ip.includes(":"),
	)) {
		if (!byAsn.has(record.asn)) byAsn.set(record.asn, []);
		byAsn.get(record.asn).push(record);
	}
	const blocked = [...byAsn.values()].find((items) => items.length >= 4);
	assert(
		blocked,
		"ASN MMDB oracle must provide four addresses in the same system",
	);
	const allowed = records.find(
		(record) => record.asn && record.asn !== blocked[0].asn,
	);
	assert(allowed, "ASN MMDB oracle must provide a different known system");
	const unknown = records.find((record) => record.ip === "203.0.113.1");
	assert.equal(
		unknown.asn,
		null,
		"ASN fixture must leave documentation address unassigned",
	);
	return {
		blocked: blocked.slice(0, 4),
		allowed,
		unknown,
		ipv6: records.find((record) => record.asn && record.ip.includes(":")),
	};
}

const request = (
	port,
	{
		host = "protected.test",
		ip = "127.0.0.1",
		uri = "/",
		headers = {},
		socketPath,
	} = {},
) =>
	new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: "127.0.0.1",
				port,
				localAddress: ip,
				path: uri,
				headers: { Host: host, ...headers },
				socketPath,
			},
			(res) => {
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () =>
					resolve({ status: res.statusCode, headers: res.headers, body }),
				);
			},
		);
		req.setTimeout(5000, () =>
			req.destroy(new Error("Firewall smoke request timed out")),
		);
		req.on("error", reject);
		req.end();
	});

// Nginx permits later writers to replace a GeoIP variable. Readiness must reject
// these otherwise-valid configurations before a country policy can be activated.
async function checkGeoipVariableWriters({
	nginx,
	modules,
	directory,
	database,
	luaPackagePath,
	luaPackageCpath,
}) {
	const reservation = net.createServer();
	const port = await listen(reservation);
	await close(reservation);
	const secondDatabase = path.join(directory, "second-country.mmdb");
	await fs.copyFile(database, secondDatabase);
	const included = path.join(directory, "country-override.conf");
	await fs.writeFile(
		included,
		`geoip2 ${quote(secondDatabase)} { $geoip2_country_code default=US source=$http_x_test_country country iso_code; }`,
	);
	const serverIncluded = path.join(directory, "server-country-override.conf");
	await fs.writeFile(
		serverIncluded,
		"set $geoip2_country_code $http_x_country;",
	);
	const parts = path.join(directory, "parts");
	await fs.mkdir(parts);
	await fs.copyFile(included, path.join(parts, "[a].conf"));
	await fs.writeFile(
		path.join(parts, "a.conf"),
		"# Harmless glob lookalike.\n",
	);
	const variants = [
		{ name: "safe", http: "", server: "", country: "GB", available: true },
		{
			name: "included-geoip",
			http: `include ${quote(included)};`,
			server: "",
			country: "SE",
			available: false,
		},
		{
			name: "map-writer",
			http: "map $http_x_country $geoip2_country_code { default US; SE SE; }",
			server: "",
			country: "SE",
			available: false,
		},
		{
			name: "server-set-writer",
			http: "",
			server: "set $GEOIP2_COUNTRY_CODE $http_x_country;",
			country: "SE",
			available: false,
		},
		{
			name: "included-server-set-writer",
			http: "",
			server: `include ${quote(serverIncluded)};`,
			country: "SE",
			available: false,
		},
		{
			name: "escaped-bracket-include",
			// Nginx preserves the unknown escape, and libc glob opens literal [a].conf.
			http: 'include "parts/\\[a].conf";',
			server: "",
			country: "SE",
			available: false,
		},
		{
			name: "country-location-named-capture",
			http: "",
			server: "",
			country: "SE",
			available: false,
			uri: "/capture/SE",
			location:
				'location ~ ^/capture/(?P<geoip2_country_code>[A-Z][A-Z])$ { return 200 "$remote_addr:$geoip2_country_code"; }',
		},
		{
			name: "country-map-named-capture",
			http: "map $uri $capture_probe { ~^/capture/(?<geoip2_country_code>[A-Z][A-Z])$ hit; default none; }",
			server: "set $capture_trigger $capture_probe;",
			country: "SE",
			available: false,
			uri: "/capture/SE",
		},
	];
	for (const variant of variants) {
		const config = `${modules.map((module) => `load_module ${quote(module)};`).join("\n")}
master_process off;
user ${os.userInfo().username};
pid ${quote(path.join(directory, "country-writer.pid"))};
error_log stderr notice;
events { worker_connections 32; }
http {
    access_log off;
    ${luaPackagePath ? `lua_package_path ${quote(luaPackagePath)};` : ""}
    ${luaPackageCpath ? `lua_package_cpath ${quote(luaPackageCpath)};` : ""}
    ${["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map((name) => `${name}_temp_path ${quote(path.join(directory, name))};`).join("\n")}
    geoip2 ${quote(database)} { $geoip2_country_code default=XX source=$remote_addr country iso_code; }
    map $geoip2_country_code $spm_fw_90001_country { default XX; GB GB; }
    ${variant.http}
    server {
        listen 127.0.0.1:${port};
        set_real_ip_from 127.0.0.1; real_ip_header X-Real-IP;
        ${variant.server}
        ${variant.location || ""}
        location / { return 200 "$remote_addr:$geoip2_country_code"; }
    }
}`;
		const configFile = path.join(directory, "country-writer.conf");
		await fs.writeFile(configFile, config);
		await utils.execFile(nginx, [
			"-p",
			`${directory}/`,
			"-c",
			configFile,
			"-t",
		]);
		// Nginx accepts these writers. The staged policy guard must reject their
		// effective lookup even when its generated required map is valid syntax.
		if (variant.available)
			await assertConfiguredFirewallLookups({ masterConfig: configFile });
		else
			await assert.rejects(
				assertConfiguredFirewallLookups({ masterConfig: configFile }),
				/Country filtering/,
			);
		let output = "";
		const child = spawn(
			nginx,
			["-p", `${directory}/`, "-c", configFile, "-g", "daemon off;"],
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		child.on("error", (error) => {
			output += error.message;
		});
		try {
			let response;
			for (let attempt = 0; attempt < 100; attempt++) {
				try {
					response = await request(port, {
						uri: variant.uri || "/",
						headers: {
							"X-Real-IP": "81.2.69.160",
							"X-Test-Country": "89.160.20.128",
							"X-Country": "SE",
						},
					});
					break;
				} catch {
					assert.equal(child.exitCode, null, output);
					await delay(50);
				}
			}
			assert.equal(response?.status, 200, `${variant.name}: ${output}`);
			assert.equal(
				response.body,
				`81.2.69.160:${variant.country}`,
				variant.name,
			);
			const status = await getFirewallGeoipStatus({ masterConfig: configFile });
			assert.equal(
				status.available,
				variant.available,
				`${variant.name} country readiness`,
			);
		} finally {
			if (child.exitCode === null) {
				child.kill("SIGTERM");
				await new Promise((resolve) => child.once("exit", resolve));
			}
		}
	}
	return variants.length * 2;
}

async function checkAsnVariableWriters({
	nginx,
	modules,
	directory,
	database,
	countryDatabase,
	probe,
	luaPackagePath,
	luaPackageCpath,
}) {
	const reservation = net.createServer();
	const port = await listen(reservation);
	await close(reservation);
	const included = path.join(directory, "asn-override.conf");
	await fs.writeFile(
		included,
		"set $spm_geoip2_asn_org 'Spoofed organization';",
	);
	const original = probe.blocked[0];
	const variants = [
		{
			name: "safe",
			available: true,
			expected: `${original.asn}:${original.organization}`,
		},
		{
			name: "asn-map",
			http: "map $http_x_probe $spm_geoip2_asn { default 999; }",
			expected: `999:${original.organization}`,
		},
		{
			name: "org-map",
			http: 'map $http_x_probe $spm_geoip2_asn_org { default "Spoofed organization"; }',
			expected: `${original.asn}:Spoofed organization`,
		},
		{
			name: "asn-server-set",
			server: "set $SPM_GEOIP2_ASN 999;",
			expected: `999:${original.organization}`,
		},
		{
			name: "org-included-set",
			server: `include ${quote(included)};`,
			expected: `${original.asn}:Spoofed organization`,
		},
		{
			name: "header-source",
			source: "$http_x_test_ip",
			expected: `${probe.allowed.asn}:${probe.allowed.organization}`,
		},
		{
			name: "unsafe-default",
			defaults: "default=999",
			expected: `${original.asn}:${original.organization}`,
		},
		{
			name: "asn-location-uppercase-named-capture",
			uri: "/capture/424242",
			location:
				'location ~ ^/capture/(?<SPM_GEOIP2_ASN>[0-9]+)$ { return 200 "$remote_addr:$spm_geoip2_asn:$spm_geoip2_asn_org"; }',
			expected: `424242:${original.organization}`,
		},
		{
			name: "asn-map-named-capture",
			uri: "/capture/424243",
			http: "map $uri $capture_probe { ~^/capture/(?'spm_geoip2_asn'[0-9]+)$ hit; default none; }",
			server: "set $capture_trigger $capture_probe;",
			expected: `424243:${original.organization}`,
		},
		{
			name: "organization-location-named-capture",
			uri: "/capture/spoofed",
			location:
				'location ~ ^/capture/(?P<spm_geoip2_asn_org>[a-z]+)$ { return 200 "$remote_addr:$spm_geoip2_asn:$spm_geoip2_asn_org"; }',
			expected: `${original.asn}:spoofed`,
		},
	];
	for (const variant of variants) {
		const configFile = path.join(directory, "asn-writer.conf");
		await fs.writeFile(
			configFile,
			`${modules.map((module) => `load_module ${quote(module)};`).join("\n")}
master_process off;
user ${os.userInfo().username};
pid ${quote(path.join(directory, "asn-writer.pid"))};
error_log stderr notice;
events { worker_connections 32; }
http {
    access_log off;
    ${luaPackagePath ? `lua_package_path ${quote(luaPackagePath)};` : ""}
    ${luaPackageCpath ? `lua_package_cpath ${quote(luaPackageCpath)};` : ""}
    ${temporaryPaths(directory)}
    ${countryDatabase ? `geoip2 ${quote(countryDatabase)} { $geoip2_country_code default=XX source=$remote_addr country iso_code; }` : ""}
    geoip2 ${quote(database)} {
        $spm_geoip2_asn ${variant.defaults || "default=0"} source=${variant.source || "$remote_addr"} autonomous_system_number;
        $spm_geoip2_asn_org source=${variant.source || "$remote_addr"} autonomous_system_organization;
    }
    map $spm_geoip2_asn $spm_fw_90002_asn_rule { default 0; ${original.asn} 1; }
    ${variant.http || ""}
    server {
        listen 127.0.0.1:${port};
        set_real_ip_from 127.0.0.1; real_ip_header X-Real-IP;
        ${variant.server || ""}
        ${variant.location || ""}
        location / { return 200 "$remote_addr:$spm_geoip2_asn:$spm_geoip2_asn_org"; }
    }
}`,
		);
		await utils.execFile(nginx, [
			"-p",
			`${directory}/`,
			"-c",
			configFile,
			"-t",
		]);
		if (variant.available)
			await assertConfiguredFirewallLookups({ masterConfig: configFile });
		else
			await assert.rejects(
				assertConfiguredFirewallLookups({ masterConfig: configFile }),
				/ASN filtering/,
			);
		const child = spawn(
			nginx,
			["-p", `${directory}/`, "-c", configFile, "-g", "daemon off;"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let output = "";
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		try {
			let response;
			for (let attempt = 0; attempt < 100; attempt++) {
				try {
					response = await request(port, {
						uri: variant.uri || "/",
						headers: {
							"X-Real-IP": original.ip,
							"X-Test-IP": probe.allowed.ip,
						},
					});
					break;
				} catch {
					assert.equal(child.exitCode, null, output);
					await delay(50);
				}
			}
			assert.equal(response?.status, 200, `${variant.name}: ${output}`);
			assert.equal(
				response.body,
				`${original.ip}:${variant.expected}`,
				variant.name,
			);
			const status = await getFirewallGeoipStatus({ masterConfig: configFile });
			assert.equal(
				status.asn.available,
				variant.available === true,
				`${variant.name} ASN readiness`,
			);
			if (countryDatabase)
				assert.equal(
					status.available,
					true,
					"unsafe ASN writer must not disable Country readiness",
				);
		} finally {
			if (child.exitCode === null) {
				child.kill("SIGTERM");
				await new Promise((resolve) => child.once("exit", resolve));
			}
		}
	}
	return variants.length * 2;
}

async function checkMissingAsnLookup({
	nginx,
	modules,
	directory,
	optional,
	required,
	blocked,
	luaPackagePath,
	luaPackageCpath,
	modsecurity,
}) {
	const reservation = net.createServer();
	const port = await listen(reservation);
	await close(reservation);
	const configFile = path.join(directory, "missing-asn.conf");
	const config = (
		host,
	) => `${modules.map((module) => `load_module ${quote(module)};`).join("\n")}
master_process off;
user ${os.userInfo().username};
pid ${quote(path.join(directory, "missing-asn.pid"))};
error_log stderr notice;
events { worker_connections 32; }
http {
    access_log off;
    ${luaPackagePath ? `lua_package_path ${quote(luaPackagePath)};` : ""}
    ${luaPackageCpath ? `lua_package_cpath ${quote(luaPackageCpath)};` : ""}
    ${temporaryPaths(directory)}
    ${host.geo}
    server {
        listen 127.0.0.1:${port};
        set_real_ip_from 127.0.0.1; real_ip_header X-Real-IP;
        ${host.filter}
        location / { return 200 "upstream"; }
    }
}`;
	await fs.writeFile(configFile, config(optional));
	await utils.execFile(nginx, ["-p", `${directory}/`, "-c", configFile, "-t"]);
	await assertConfiguredFirewallLookups({ masterConfig: configFile });
	const child = spawn(
		nginx,
		["-p", `${directory}/`, "-c", configFile, "-g", "daemon off;"],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	let output = "";
	child.stderr.on("data", (chunk) => {
		output += chunk;
	});
	try {
		let response;
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				response = await request(port, {
					headers: { "X-Real-IP": blocked.ip },
				});
				break;
			} catch {
				assert.equal(child.exitCode, null, output);
				await delay(50);
			}
		}
		assert.equal(response?.status, 403, output);
		assert(response.body.includes("Manual with ASN information"));
		assert(!response.body.includes(`AS${blocked.asn}`));
		assert(!response.body.includes(escapeHtml(blocked.organization)));
		if (modsecurity) {
			const json = JSON.parse(
				(
					await request(port, {
						headers: { "X-Real-IP": blocked.ip, Accept: "application/json" },
					})
				).body,
			);
			assert(!("asn" in json));
			assert(!("asn_organization" in json));
		}
		const lastHit = JSON.parse(
			(
				await fs.readFile(
					path.join(directory, "logs/ip_firewall_33.log"),
					"utf8",
				)
			)
				.trim()
				.split("\n")
				.at(-1),
		);
		assert.equal(lastHit.asn, "");
		assert.equal(lastHit.asn_organization, "");
	} finally {
		if (child.exitCode === null) {
			child.kill("SIGTERM");
			await new Promise((resolve) => child.once("exit", resolve));
		}
	}
	await fs.writeFile(configFile, config(required));
	await assert.rejects(
		utils.execFile(nginx, ["-p", `${directory}/`, "-c", configFile, "-t"]),
		/unknown "spm_geoip2_asn" variable/,
	);
	return modsecurity ? 5 : 4;
}

// A long UTF-8 literal can cross ngx_http_lua's parser buffer even below 4 KiB.
// Exercise actual config parsing and byte-preserving Lua output at different offsets.
async function checkLuaPageSerialization({
	nginx,
	modules,
	directory,
	luaPackagePath,
	luaPackageCpath,
}) {
	const reservation = net.createServer();
	const port = await listen(reservation);
	await close(reservation);
	const engine = utils.getRenderEngine();
	const pages = [
		["🌐".repeat(990), "}{%{reason}"].join("").repeat(3),
		["🌐".repeat(249), '"\\\0\n\r\t}{%{reason}', "🌐".repeat(751)]
			.join("")
			.repeat(4),
	];
	const locations = await Promise.all(
		pages.map((page, index) =>
			engine.parseAndRender(
				`location = /page-${index} { content_by_lua_block {
            local page = {{ page | luaPageString }}
            ngx.print(page)
        } }`,
				{ page },
			),
		),
	);
	const paddingLengths = Array.from({ length: 32 }, (_, index) => index * 128);
	for (const padding of paddingLengths) {
		const configFile = path.join(directory, `lua-page-${padding}.conf`);
		await fs.writeFile(
			configFile,
			`${modules.map((module) => `load_module ${quote(module)};`).join("\n")}
master_process off;
user ${os.userInfo().username};
pid ${quote(path.join(directory, "lua-page.pid"))};
error_log stderr notice;
events { worker_connections 32; }
http {
    access_log off;
    ${luaPackagePath ? `lua_package_path ${quote(luaPackagePath)};` : ""}
    ${luaPackageCpath ? `lua_package_cpath ${quote(luaPackageCpath)};` : ""}
    ${temporaryPaths(directory)}
    server {
        listen 127.0.0.1:${port};
        #${"x".repeat(padding)}
        ${locations.join("\n")}
    }
}`,
		);
		await utils.execFile(nginx, [
			"-p",
			`${directory}/`,
			"-c",
			configFile,
			"-t",
		]);
		const child = spawn(
			nginx,
			["-p", `${directory}/`, "-c", configFile, "-g", "daemon off;"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let output = "";
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		child.on("error", (error) => {
			output += error.message;
		});
		try {
			for (const [index, page] of pages.entries()) {
				let response;
				for (let attempt = 0; attempt < 100; attempt++) {
					try {
						response = await request(port, { uri: `/page-${index}` });
						break;
					} catch {
						assert.equal(child.exitCode, null, output);
						await delay(50);
					}
				}
				assert.equal(
					response?.status,
					200,
					`Lua page ${index}, padding ${padding}: ${output}`,
				);
				assert.equal(
					response.body,
					page,
					`Lua page ${index}, padding ${padding} must round-trip exactly`,
				);
			}
		} finally {
			if (child.exitCode === null) {
				child.kill("SIGTERM");
				await new Promise((resolve) => child.once("exit", resolve));
			}
		}
	}
	return paddingLengths.length * (1 + pages.length);
}

// API-valid public text may exceed the Lua parser's byte limit after UTF-8 or
// decimal escaping. Exercise the actual partial, not a synthetic Lua assignment.
async function checkFirewallTextSerialization({
	nginx,
	modules,
	directory,
	luaPackagePath,
	luaPackageCpath,
	modsecurity,
}) {
	const reservation = net.createServer();
	const port = await listen(reservation);
	await close(reservation);
	const engine = utils.getRenderEngine();
	const variants = ["中", "\\"];
	for (const [index, character] of variants.entries()) {
		const policy = normalizeFirewallPolicy({
			enabled: true,
			list_ids: [9],
			denylist: [{ address: "127.0.0.2", reason: character.repeat(1000) }],
			public_message: character.repeat(2000),
			support_url: `https://support.test/${"中".repeat(2000)}`,
		});
		const list = {
			id: 9,
			name: `${'"\\<>&'.repeat(50)}final`,
			reason: `${'"\\\n'.repeat(666)}ok`,
			entries: ["127.0.0.3"],
		};
		const firewall = await buildFirewallRender(
			{ id: 35, enabled: true, meta: { ip_firewall: policy } },
			[list],
		);
		const geo = await engine.renderFile("_ip_firewall_geo.conf", { firewall });
		let filter = (
			await engine.renderFile("_ip_firewall.conf", { firewall })
		).replaceAll("/data/logs/", `${directory}/logs/`);
		if (!modsecurity)
			filter = filter.replace(
				"    modsecurity off;",
				"    # ModSecurity is unavailable.",
			);
		const configFile = path.join(directory, `firewall-text-${index}.conf`);
		await fs.writeFile(
			configFile,
			`${modules.map((module) => `load_module ${quote(module)};`).join("\n")}
master_process off;
user ${os.userInfo().username};
pid ${quote(path.join(directory, "firewall-text.pid"))};
error_log stderr notice;
events { worker_connections 32; }
http {
    access_log off;
    ${luaPackagePath ? `lua_package_path ${quote(luaPackagePath)};` : ""}
    ${luaPackageCpath ? `lua_package_cpath ${quote(luaPackageCpath)};` : ""}
    ${temporaryPaths(directory)}
    ${geo}
    server { listen 127.0.0.1:${port}; ${filter} location / { return 200 "allowed"; } }
}`,
		);
		await utils.execFile(nginx, [
			"-p",
			`${directory}/`,
			"-c",
			configFile,
			"-t",
		]);
		const child = spawn(
			nginx,
			["-p", `${directory}/`, "-c", configFile, "-g", "daemon off;"],
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let output = "";
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		try {
			for (const [ip, reason, source] of [
				["127.0.0.2", policy.denylist[0].reason, "Manual IP block"],
				["127.0.0.3", list.reason, list.name],
			]) {
				let response;
				for (let attempt = 0; attempt < 100; attempt++) {
					try {
						response = await request(port, {
							ip,
							headers: { Accept: "application/json" },
						});
						break;
					} catch {
						assert.equal(child.exitCode, null, output);
						await delay(50);
					}
				}
				assert.equal(response?.status, 403, output);
				const json = JSON.parse(response.body);
				assert.equal(json.reason, reason);
				assert.equal(json.source, source);
				assert.equal(json.message, policy.public_message);
				assert.equal(json.support_url, policy.support_url);
				const html = await request(port, { ip });
				assert.equal(html.status, 403);
				for (const value of [
					reason,
					source,
					policy.public_message,
					policy.support_url,
				]) {
					assert(
						html.body.includes(escapeHtml(value)),
						"Firewall HTML must preserve escaped public text",
					);
				}
			}
		} finally {
			if (child.exitCode === null) {
				child.kill("SIGTERM");
				await new Promise((resolve) => child.once("exit", resolve));
			}
		}
	}
	return variants.length * 5;
}

// Use real static files: rewrite-phase return directives would bypass the access
// handlers whose inheritance this regression is intended to exercise.
async function checkAcmeAuthentication({
	nginx,
	modules,
	directory,
	luaPackagePath,
	luaPackageCpath,
	modsecurity,
}) {
	const fixture = path.join(directory, "acme-auth");
	await fs.mkdir(path.join(fixture, "acme/.well-known/acme-challenge"), {
		recursive: true,
	});
	await fs.mkdir(path.join(fixture, "resty"));
	await fs.writeFile(
		path.join(fixture, "acme/.well-known/acme-challenge/TOKEN"),
		"challenge-proof",
	);
	await fs.writeFile(
		path.join(fixture, "resty/openidc.lua"),
		'return { authenticate = function() return ngx.redirect("/oidc/sign-in", 302) end }',
	);
	const key = path.join(fixture, "key.pem");
	const certificate = path.join(fixture, "certificate.pem");
	await utils.execFile("openssl", [
		"req",
		"-x509",
		"-newkey",
		"rsa:2048",
		"-nodes",
		"-keyout",
		key,
		"-out",
		certificate,
		"-days",
		"1",
		"-subj",
		"/CN=redirect.test",
	]);
	const upstream = http.createServer((req, res) => {
		const auth =
			req.url.startsWith("/oauth2/") ||
			req.url.startsWith("/outpost.goauthentik.io/");
		res.writeHead(auth ? 401 : 200);
		res.end(auth ? "authentication required" : "protected upstream");
	});
	let child;
	let output = "";
	try {
		const upstreamPort = await listen(upstream);
		const reserve = net.createServer();
		const port = await listen(reserve);
		await close(reserve);
		const tlsReserve = net.createServer();
		const tlsPort = await listen(tlsReserve);
		await close(tlsReserve);
		const engine = utils.getRenderEngine();
		const variants = [
			{ name: "baseline", expected: 200 },
			...["oauth2_proxy", "authentik_proxy", "oidc"].flatMap((auth) => [
				{ name: auth, auth, expected: 302 },
				{ name: `${auth}-firewall`, auth, firewall: true, expected: 302 },
			]),
			{ name: "mtls", mtls: true, expected: 403 },
			{ name: "redirect", redirect: true, expected: 308 },
		];
		const definitions = [];
		const servers = [];
		for (const [offset, variant] of variants.entries()) {
			const data = {
				id: 100 + offset,
				enabled: true,
				server_names: [`${variant.name}.test`],
				forward_scheme: "http",
				forward_host: "127.0.0.1",
				forward_port: upstreamPort,
				use_default_location: true,
				auth_type: variant.auth || "",
				is_oauth2: variant.auth === "oauth2_proxy",
				oidc_enabled: variant.auth === "oidc",
				access_list_id: variant.auth || variant.mtls ? 4 : 0,
				access_list: {
					meta: {
						auth_type: variant.auth,
						authentik_host: `http://127.0.0.1:${upstreamPort}`,
						oidc_discovery_url:
							"https://fixture.invalid/.well-known/openid-configuration",
						oidc_client_id: "fixture",
						oidc_client_secret: "fixture",
					},
					clients: [],
					items: [],
					mtls_enabled: Boolean(variant.mtls),
				},
				certificate_id: variant.redirect ? 5 : 0,
				certificate: variant.redirect ? { provider: "internal" } : null,
				ssl_forced: Boolean(variant.redirect),
				env: {
					DISABLE_HTTP: "false",
					DISABLE_IPV6: "true",
					DISABLE_H3_QUIC: "true",
					LISTEN_PROXY_PROTOCOL: "false",
					IPV4_BINDING: "127.0.0.1",
					HTTP_PORT: port,
					HTTPS_PORT: tlsPort,
				},
			};
			let filter = "";
			if (variant.firewall) {
				data.firewall = await buildFirewallRender({
					id: data.id,
					enabled: true,
					meta: {
						ip_firewall: {
							enabled: true,
							denylist: [
								{
									address: "127.0.0.2",
									reason: "ACME must bypass only the firewall",
								},
							],
						},
					},
				});
				definitions.push(
					await engine.renderFile("_ip_firewall_geo.conf", data),
				);
				filter = (
					await engine.renderFile("_ip_firewall.conf", data)
				).replaceAll("/data/logs/", `${fixture}/`);
				if (!modsecurity) filter = filter.replace("modsecurity off;", "");
			}
			const common = (await engine.renderFile("_common.conf", data))
				// Fancyindex and shared includes are unrelated to the auth inheritance
				// and need not be installed in the portable native Nginx fixture.
				.replace("fancyindex off;", "")
				.replaceAll("/data/acme-challenge", path.join(fixture, "acme"))
				.replace("/data/tls/internal/npm-5/fullchain.pem", certificate)
				.replace("/data/tls/internal/npm-5/privkey.pem", key)
				// ShieldPM builds provide these port variables; portable Nginx does not.
				// Private fixture stand-ins avoid redefining the build's read-only variables.
				.replaceAll(
					"$is_request_port$request_port",
					"$spm_smoke_acme_port_suffix$spm_smoke_acme_port",
				);
			const logic = (await engine.renderFile("_proxy_logic.conf", data))
				.replace(/^\s*include [^;]+;/gm, "")
				.replaceAll(
					"http://unix:/run/shieldpm/oauth2-proxy-4.sock:/oauth2/auth",
					`http://127.0.0.1:${upstreamPort}/oauth2/auth`,
				)
				.replaceAll(
					"http://unix:/run/shieldpm/oauth2-proxy-4.sock",
					`http://127.0.0.1:${upstreamPort}`,
				);
			servers.push(`server { ${filter}\n${common}\n${logic}\n }`);
		}
		const configuration = `${modules.map((module) => `load_module ${quote(module)};`).join("\n")}
master_process off;
user ${os.userInfo().username};
pid ${quote(path.join(fixture, "nginx.pid"))};
error_log stderr notice;
events { worker_connections 128; }
http {
    access_log off;
    ${temporaryPaths(fixture)}
    lua_package_path ${quote(`${fixture}/?.lua;${luaPackagePath || ""};;`)};
    ${luaPackageCpath ? `lua_package_cpath ${quote(luaPackageCpath)};` : ""}
    map $server_port $spm_smoke_acme_port_suffix { default ""; }
    map $server_port $spm_smoke_acme_port { default ""; }
    ${definitions.join("\n")}
    ${servers.join("\n")}
}`;
		const file = path.join(fixture, "nginx.conf");
		await fs.writeFile(file, configuration);
		await utils.execFile(nginx, ["-p", `${fixture}/`, "-c", file, "-t"]);
		child = spawn(
			nginx,
			["-p", `${fixture}/`, "-c", file, "-g", "daemon off;"],
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		child.on("error", (error) => {
			output += error.message;
		});
		for (let attempt = 0; attempt < 40; attempt++) {
			try {
				await request(port, { host: "baseline.test" });
				break;
			} catch {
				assert.equal(child.exitCode, null, output);
				await delay(50);
			}
		}
		for (const variant of variants) {
			const host = `${variant.name}.test`;
			const challenge = await request(port, {
				host,
				ip: "127.0.0.2",
				uri: "/.well-known/acme-challenge/TOKEN",
			});
			assert.equal(
				challenge.status,
				variant.mtls || variant.redirect ? variant.expected : 200,
				host,
			);
			if (!variant.mtls && !variant.redirect)
				assert.equal(challenge.body, "challenge-proof", host);
			const ordinary = await request(port, { host, uri: "/private" });
			assert.equal(ordinary.status, variant.expected, host);
			if (variant.auth)
				assert(ordinary.headers.location, `${host} must require sign-in`);
			if (variant.redirect)
				assert.equal(
					ordinary.headers.location,
					"https://redirect.test/private",
				);
			if (variant.firewall) {
				assert.equal(
					(await request(port, { host, ip: "127.0.0.2", uri: "/private" }))
						.status,
					403,
				);
			}
		}
		return (
			1 +
			variants.length * 2 +
			variants.filter((variant) => variant.firewall).length
		);
	} finally {
		if (child && child.exitCode === null) {
			child.kill("SIGTERM");
			await new Promise((resolve) => child.once("exit", resolve));
		}
		if (upstream.listening) await close(upstream);
	}
}

async function checkIpv6Upstreams({
	nginx,
	modules,
	directory,
	luaPackagePath,
	luaPackageCpath,
}) {
	const fixture = path.join(directory, "ipv6-upstreams");
	await fs.mkdir(fixture);
	// Mapped loopback exercises a real IPv6 URL while retaining portability in
	// network-none CI containers that have no native ::1 address configured.
	const bare = "::ffff:127.0.0.1";
	const key = await fs.readFile(path.join(directory, "acme-auth/key.pem"));
	const cert = await fs.readFile(
		path.join(directory, "acme-auth/certificate.pem"),
	);
	const upstreams = [
		[
			"http",
			http.createServer((req, res) => {
				res.writeHead(200, {
					"Content-Type": "text/plain; charset=utf-8",
					"X-Content-Type-Options": "nosniff",
				});
				res.end(`http:${req.url}`);
			}),
		],
		[
			"https",
			https.createServer({ key, cert }, (req, res) => {
				res.writeHead(200, {
					"Content-Type": "text/plain; charset=utf-8",
					"X-Content-Type-Options": "nosniff",
				});
				res.end(`https:${req.url}`);
			}),
		],
	];
	let child;
	let output = "";
	try {
		const reserve = net.createServer();
		const port = await listen(reserve);
		await close(reserve);
		const engine = utils.getRenderEngine();
		const servers = [];
		const variants = [];
		for (const [scheme, upstream] of upstreams) {
			const upstreamPort = await listen(upstream);
			for (const [name, forwardHost] of [
				["bare", bare],
				["bracketed", `[${bare}]`],
			]) {
				const host = `${scheme}-${name}.test`;
				const data = {
					forward_scheme: scheme,
					forward_host: forwardHost,
					forward_port: upstreamPort,
					use_default_location: true,
					path: "/custom",
				};
				const location = await engine.renderFile(
					"_proxy_host_custom_location.conf",
					data,
				);
				const logic = await engine.renderFile("_proxy_logic.conf", {
					...data,
					locations: location,
				});
				servers.push(
					`server { listen 127.0.0.1:${port}; server_name ${host}; ${logic.replace(/^\s*include [^;]+;/gm, "")} }`,
				);
				variants.push({ host, scheme });
			}
		}
		const config = `${modules.map((module) => `load_module ${quote(module)};`).join("\n")}
master_process off;
user ${os.userInfo().username};
pid ${quote(path.join(fixture, "nginx.pid"))};
error_log stderr notice;
events { worker_connections 128; }
http {
    access_log off;
    ${luaPackagePath ? `lua_package_path ${quote(luaPackagePath)};` : ""}
    ${luaPackageCpath ? `lua_package_cpath ${quote(luaPackageCpath)};` : ""}
    ${temporaryPaths(fixture)}
    ${servers.join("\n")}
}`;
		const file = path.join(fixture, "nginx.conf");
		await fs.writeFile(file, config);
		await utils.execFile(nginx, ["-p", `${fixture}/`, "-c", file, "-t"]);
		child = spawn(
			nginx,
			["-p", `${fixture}/`, "-c", file, "-g", "daemon off;"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		child.on("error", (error) => {
			output += error.message;
		});
		for (let attempt = 0; attempt < 40; attempt++) {
			try {
				await request(port, { host: variants[0].host });
				break;
			} catch {
				assert.equal(child.exitCode, null, output);
				await delay(50);
			}
		}
		for (const { host, scheme } of variants) {
			for (const uri of ["/", "/custom/probe?a=1"]) {
				const response = await request(port, { host, uri });
				assert.equal(response.status, 200, `${host} ${uri}: ${output}`);
				assert.equal(
					response.headers["content-type"],
					"text/plain; charset=utf-8",
					`${host} must serve the echoed URI as plain text`,
				);
				assert.equal(
					response.headers["x-content-type-options"],
					"nosniff",
					`${host} must prevent content sniffing`,
				);
				assert.equal(
					response.body,
					`${scheme}:${uri}`,
					`${host} must retain the request URI`,
				);
			}
		}
		return 1 + variants.length * 2;
	} finally {
		if (child && child.exitCode === null) {
			child.kill("SIGTERM");
			await new Promise((resolve) => child.once("exit", resolve));
		}
		for (const [, upstream] of upstreams)
			if (upstream.listening) await close(upstream);
	}
}

/**
 * Run the actual firewall partials in an isolated Nginx instance, using real loopback client IPs.
 * A portable Nginx lacking ModSecurity can validate the filter/Lua behavior; the image smoke
 * supplies its full module build and therefore also validates the unmodified modsecurity directive.
 */
export async function runIpFirewallSmoke({
	nginx = "nginx",
	modules = [],
	luaPackagePath,
	luaPackageCpath,
	modsecurity = false,
	tcpInternal = false,
	geoipDatabase,
	asnDatabase,
} = {}) {
	const temporary = await fs.mkdtemp(
		path.join(os.tmpdir(), "shieldpm-ip-firewall-"),
	);
	const upstream = http.createServer((req, res) => {
		res.writeHead(req.url === "/teapot" ? 418 : 200, {
			"Content-Type": "text/plain",
		});
		res.end(`upstream:${req.url}`);
	});
	let process;
	let output = "";
	try {
		const upstreamPort = await listen(upstream);
		const reservation = net.createServer();
		const port = await listen(reservation);
		await close(reservation);
		await fs.mkdir(path.join(temporary, "logs"));
		const policy = {
			enabled: true,
			list_ids: [9, 10],
			allowlist: ["127.0.0.1", "::ffff:127.0.0.3", "2001:db8:abcd:1::/64"],
			denylist: [
				{
					address: "::ffff:127.0.0.2",
					reason: "Operator <script>alert(1)</script>",
				},
				{ address: "2001:db8:abcd::/48", reason: "Manual IPv6 network" },
			],
			public_message: "The site operator restricts this network.",
			support_url: "https://support.test/?a=1&b=2",
			internal_note: "SECRET INTERNAL NOTE",
		};
		const lists = [
			{
				id: 9,
				name: "VPN <b>list</b>",
				reason: "VPN list membership",
				entries: ["127.0.0.0/24", "2001:db8::/32"],
			},
			{
				id: 10,
				name: "Specific network",
				reason: "Specific list policy",
				entries: ["::ffff:127.0.0.4/128", "2001:db8:abcd:2::/64"],
			},
		];
		const engine = utils.getRenderEngine();
		const render = async (
			id,
			hostPolicy = policy,
			hostLists = lists,
			capabilities,
		) => {
			const firewall = await buildFirewallRender(
				{ id, enabled: true, meta: { ip_firewall: hostPolicy } },
				hostLists,
				capabilities,
			);
			const geo = await engine.renderFile("_ip_firewall_geo.conf", {
				firewall,
			});
			let filter = await engine.renderFile("_ip_firewall.conf", { firewall });
			filter = filter.replaceAll("/data/logs/", `${temporary}/logs/`);
			if (!modsecurity)
				filter = filter.replace(
					"    modsecurity off;",
					"    # Portable test: ModSecurity module is unavailable.",
				);
			return { geo, filter };
		};
		const primary = await render(17);
		const anubis = await render(18);
		const trusted = await render(19);
		const countryPolicy = {
			enabled: true,
			country_denylist: ["GB"],
			allowlist: ["81.2.69.163"],
			denylist: [{ address: "81.2.69.161", reason: "Manual before country" }],
			list_ids: [9],
		};
		const countryLists = [
			{
				id: 9,
				name: "Country-overlapping list",
				reason: "List before country",
				entries: ["81.2.69.162"],
			},
		];
		const countries = geoipDatabase
			? await Promise.all([
					render(20, countryPolicy, countryLists),
					render(
						21,
						{ ...countryPolicy, block_unknown_country: true },
						countryLists,
					),
					render(
						22,
						{
							...countryPolicy,
							country_reason: 'Country <script>"policy"</script>',
						},
						countryLists,
					),
					render(23, countryPolicy, countryLists),
				])
			: [];
		const asn = asnDatabase ? await asnProbe(asnDatabase) : null;
		if (asn && geoipDatabase)
			asn.country = (
				await oracle(geoipDatabase, [asn.blocked[0].ip])
			)[0].country;
		const asnPolicy = asn
			? {
					enabled: true,
					asn_denylist: [{ asn: asn.blocked[0].asn, reason: "" }],
					allowlist: [asn.blocked[3].ip],
					denylist: [
						{ address: asn.blocked[1].ip, reason: "Manual before ASN" },
					],
					list_ids: [9],
				}
			: null;
		const asnLists = asn
			? [
					{
						id: 9,
						name: "ASN overlap",
						reason: "List before ASN",
						entries: [asn.blocked[2].ip],
					},
				]
			: [];
		const asns = asn
			? await Promise.all([
					render(30, asnPolicy, asnLists),
					render(
						31,
						{
							...asnPolicy,
							asn_denylist: [
								{
									asn: asn.blocked[0].asn,
									reason: 'ASN <script>"policy"</script>',
								},
							],
						},
						asnLists,
					),
					render(32, asnPolicy, asnLists),
					render(
						33,
						{
							enabled: true,
							denylist: [
								{
									address: asn.blocked[0].ip,
									reason: "Manual with ASN information",
								},
								{ address: asn.unknown.ip, reason: "Unknown ASN information" },
							],
						},
						[],
						{ country: Boolean(geoipDatabase), asn: true },
					),
					...(geoipDatabase
						? [
								render(
									34,
									{
										...asnPolicy,
										block_unknown_country: true,
										country_denylist: [
											...new Set(["GB", asn.country].filter(Boolean)),
										],
									},
									asnLists,
								),
							]
						: []),
					...(asn.ipv6
						? [
								render(
									35,
									{
										enabled: true,
										asn_denylist: [
											{ asn: asn.ipv6.asn, reason: "IPv6 ASN oracle" },
										],
									},
									[],
								),
							]
						: []),
				])
			: [];
		const unixSocket = path.join(temporary, "anubis-upstream.sock");
		let internalPort;
		if (tcpInternal) {
			const internalReservation = net.createServer();
			internalPort = await listen(internalReservation);
			await close(internalReservation);
		}
		const internalTarget = tcpInternal
			? `http://127.0.0.1:${internalPort}`
			: `http://unix:${unixSocket}`;
		const config = `${modules.map((module) => `load_module ${quote(module)};`).join("\n")}
worker_processes 1;
master_process off;
user ${os.userInfo().username};
pid ${quote(path.join(temporary, "nginx.pid"))};
error_log stderr notice;
events { worker_connections 128; }
http {
    client_body_temp_path ${quote(path.join(temporary, "body"))};
    proxy_temp_path ${quote(path.join(temporary, "proxy"))};
    fastcgi_temp_path ${quote(path.join(temporary, "fastcgi"))};
    uwsgi_temp_path ${quote(path.join(temporary, "uwsgi"))};
    scgi_temp_path ${quote(path.join(temporary, "scgi"))};
    ${luaPackagePath ? `lua_package_path ${quote(luaPackagePath)};` : ""}
    ${luaPackageCpath ? `lua_package_cpath ${quote(luaPackageCpath)};` : ""}
    access_log off;
    ${geoipDatabase ? `geoip2 ${quote(geoipDatabase)} { $geoip2_country_code default=XX source=$remote_addr country iso_code; }` : ""}
    ${asnDatabase ? `geoip2 ${quote(asnDatabase)} { $spm_geoip2_asn default=0 source=$remote_addr autonomous_system_number; $spm_geoip2_asn_org source=$remote_addr autonomous_system_organization; }` : ""}
    ${primary.geo}
    ${anubis.geo}
    ${trusted.geo}
    ${countries.map((country) => country.geo).join("\n")}
    ${asns.map((system) => system.geo).join("\n")}
    server {
        listen 127.0.0.1:${port}; server_name protected.test;
        ${primary.filter}
        satisfy any; allow all;
        auth_request /auth;
        error_page 401 403 = @signin;
        proxy_intercept_errors on;
        location = /auth { internal; auth_request off; return 204; }
        location @signin { return 302 /oauth2/signin; }
        location /.well-known/acme-challenge/ { auth_request off; return 200 "challenge"; }
        location /needs-auth { satisfy all; auth_request off; auth_basic "Private"; auth_basic_user_file ${quote(path.join(temporary, "users"))}; proxy_pass http://127.0.0.1:${upstreamPort}; }
        location /custom { proxy_pass http://127.0.0.1:${upstreamPort}; }
        location /spm-upload { proxy_pass http://127.0.0.1:${upstreamPort}; }
        location / { proxy_pass http://127.0.0.1:${upstreamPort}; }
    }
    server {
        listen 127.0.0.1:${port}; server_name anubis.test;
        ${anubis.filter}
        location / { proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_pass ${internalTarget}; }
    }
    server {
        listen ${tcpInternal ? `127.0.0.1:${internalPort}` : `unix:${unixSocket}`}; server_name anubis.test;
        set_real_ip_from ${tcpInternal ? "127.0.0.1" : "unix:"}; real_ip_header X-Real-IP;
        location / { proxy_pass http://127.0.0.1:${upstreamPort}; }
    }
    server {
        listen 127.0.0.1:${port}; server_name trusted.test;
        set_real_ip_from 127.0.0.1; real_ip_header X-Real-IP;
        ${trusted.filter}
        access_by_lua_block { if ngx.var.http_x_sso_probe == "deny" then return ngx.redirect("/sign-in", 302) end }
        ${
					modsecurity
						? `modsecurity on;
        modsecurity_rules 'SecRuleEngine On
            SecRule ARGS:firewall_probe "@streq bad" "id:990001,phase:1,deny,status:406"
            SecRule RESPONSE_STATUS "@streq 403" "id:990002,phase:3,deny,status:409"';`
						: ""
				}
        location / { proxy_pass http://127.0.0.1:${upstreamPort}; }
    }
    server {
        listen 127.0.0.1:${port}; server_name unfiltered.test;
        location / { proxy_pass http://127.0.0.1:${upstreamPort}; }
    }
    ${countries
			.map(
				(country, index) => `server {
        listen 127.0.0.1:${port}; server_name ${["country.test", "unknown.test", "countrycustom.test", "countryanubis.test"][index]};
        set_real_ip_from 127.0.0.1; real_ip_header X-Real-IP;
        ${country.filter}
        satisfy any; allow all;
        error_page 401 403 = @signin;
        location @signin { return 302 /oauth2/signin; }
        location /.well-known/acme-challenge/ { return 200 "challenge"; }
        location /needs-auth { satisfy all; auth_basic "Private"; auth_basic_user_file ${quote(path.join(temporary, "users"))}; proxy_pass http://127.0.0.1:${upstreamPort}; }
        location / { ${index === 3 ? `proxy_set_header Host anubis.test; proxy_set_header X-Real-IP $remote_addr; proxy_pass ${internalTarget};` : `proxy_pass http://127.0.0.1:${upstreamPort};`} }
    }`,
			)
			.join("\n")}
    ${asns
			.map(
				(system, index) => `server {
        listen 127.0.0.1:${port}; server_name ${["asn.test", "asncustom.test", "asnanubis.test", "asninfo.test", ...(geoipDatabase ? ["asncountry.test"] : []), ...(asn?.ipv6 ? ["asnv6.test"] : [])][index]};
        set_real_ip_from 127.0.0.1; real_ip_header X-Real-IP;
        ${system.filter}
        satisfy any; allow all;
        error_page 401 403 = @signin;
        location @signin { return 302 /oauth2/signin; }
        location /.well-known/acme-challenge/ { return 200 "challenge"; }
        location /needs-auth { satisfy all; auth_basic "Private"; auth_basic_user_file ${quote(path.join(temporary, "users"))}; proxy_pass http://127.0.0.1:${upstreamPort}; }
        location / { ${index === 2 ? `proxy_set_header Host anubis.test; proxy_set_header X-Real-IP $remote_addr; proxy_pass ${internalTarget};` : `proxy_pass http://127.0.0.1:${upstreamPort};`} }
    }`,
			)
			.join("\n")}
}`;
		assert(!config.includes("SECRET INTERNAL NOTE"));
		const configFile = path.join(temporary, "nginx.conf");
		await fs.writeFile(configFile, config);
		await utils.execFile(nginx, [
			"-p",
			`${temporary}/`,
			"-c",
			configFile,
			"-t",
		]);
		await assertConfiguredFirewallLookups({ masterConfig: configFile });
		process = spawn(
			nginx,
			["-p", `${temporary}/`, "-c", configFile, "-g", "daemon off;"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		process.stdout.on("data", (chunk) => {
			output += chunk;
		});
		process.stderr.on("data", (chunk) => {
			output += chunk;
		});
		process.on("error", (error) => {
			output += error.message;
		});
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				await request(port);
				break;
			} catch {
				if (process.exitCode !== null)
					throw new Error(`Nginx exited: ${output}`);
				await delay(50);
			}
		}
		const allowed = await request(port);
		assert.equal(allowed.status, 200);
		assert.equal(allowed.body, "upstream:/");
		const blocked = await request(port, {
			ip: "127.0.0.2",
			headers: { "Accept-Language": "de" },
		});
		assert.equal(blocked.status, 403);
		assert(blocked.body.includes("Zugriff eingeschränkt"));
		assert(blocked.body.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
		assert(!blocked.body.includes("<script>"));
		assert(!blocked.body.includes("SECRET INTERNAL NOTE"));
		assert(!blocked.headers.location);
		assert.match(blocked.headers["cache-control"], /no-store/);
		assert.equal(blocked.headers["x-request-id"].length, 32);
		const english = await request(port, { ip: "127.0.0.2" });
		assert.equal(english.status, 403);
		assert(english.body.includes("Access restricted"));
		if (modsecurity) {
			const json = await request(port, {
				ip: "127.0.0.2",
				headers: { Accept: "application/json" },
			});
			assert.equal(json.status, 403);
			assert.equal(JSON.parse(json.body).error, "ip_blocked");
			assert.equal(
				JSON.parse(json.body).reason,
				"Operator <script>alert(1)</script>",
			);
		}
		assert.equal((await request(port, { ip: "127.0.0.3" })).status, 200);
		assert.equal(
			(await request(port, { ip: "127.0.0.3", uri: "/needs-auth" })).status,
			302,
		);
		assert.equal(
			(await request(port, { ip: "127.0.0.2", host: "unfiltered.test" }))
				.status,
			200,
		);
		for (const uri of [
			"/custom/path",
			"/spm-upload/file",
			"/.well-known/acme-challenge/folder/secret",
		])
			assert.equal((await request(port, { ip: "127.0.0.2", uri })).status, 403);
		assert.equal(
			(
				await request(port, {
					ip: "127.0.0.2",
					uri: "/.well-known/acme-challenge/TOKEN_123-abc",
				})
			).status,
			200,
		);
		assert.equal(
			(
				await request(port, {
					ip: "127.0.0.2",
					headers: { "X-Real-IP": "127.0.0.3", "X-Forwarded-For": "127.0.0.3" },
				})
			).status,
			403,
		);
		assert.equal(
			(
				await request(port, {
					headers: { "X-Real-IP": "127.0.0.2", "X-Forwarded-For": "127.0.0.2" },
				})
			).status,
			200,
		);
		assert.equal(
			(await request(port, { ip: "127.0.0.2", host: "anubis.test" })).status,
			403,
		);
		const forwarded = await request(port, {
			host: "trusted.test",
			headers: { "X-Real-IP": "127.0.0.2" },
		});
		assert.equal(forwarded.status, 403);
		assert(forwarded.body.includes("127.0.0.2"));
		assert.equal(
			(
				await request(port, {
					host: "trusted.test",
					ip: "127.0.0.3",
					headers: { "X-Real-IP": "127.0.0.2" },
				})
			).status,
			200,
		);
		assert.equal((await request(port, { host: "anubis.test" })).status, 200);
		assert.equal(
			(
				await request(tcpInternal ? internalPort : port, {
					host: "anubis.test",
					socketPath: tcpInternal ? undefined : unixSocket,
					headers: { "X-Real-IP": "127.0.0.2" },
				})
			).status,
			200,
		);
		const specific = await request(port, { ip: "127.0.0.4" });
		assert(specific.body.includes("Specific list policy"));
		const wide = await request(port, { ip: "127.0.0.7" });
		assert(wide.body.includes("VPN list membership"));
		assert(wide.body.includes("VPN &lt;b&gt;list&lt;/b&gt;"));
		const teapot = await request(port, { uri: "/teapot" });
		assert.equal(teapot.status, 418);
		assert.equal(teapot.body, "upstream:/teapot");
		assert(!teapot.body.includes("ip_blocked"));
		assert(!teapot.body.includes("Access restricted"));
		const trustedRequest = (ip, options = {}) =>
			request(port, {
				host: "trusted.test",
				...options,
				headers: { "X-Real-IP": ip, ...options.headers },
			});
		// An address exception bypasses the firewall, while inherited access-phase
		// authentication and an active WAF remain effective on its upstream route.
		assert.equal(
			(
				await trustedRequest("127.0.0.3", {
					headers: { "X-SSO-Probe": "deny" },
				})
			).status,
			302,
		);
		const beforeAccess = await trustedRequest("127.0.0.2", {
			uri: "/?firewall_probe=bad",
			headers: { "X-SSO-Probe": "deny" },
		});
		assert.equal(beforeAccess.status, 403);
		assert(!beforeAccess.headers.location);
		if (modsecurity)
			assert.equal(
				(await trustedRequest("127.0.0.3", { uri: "/?firewall_probe=bad" }))
					.status,
				406,
			);
		// RealIP supplies IPv6 to Nginx's actual geo radix lookup; these checks do
		// not require an IPv6 socket on the runner.
		const manualV6 = await trustedRequest("2001:db8:abcd:2::2");
		assert.equal(manualV6.status, 403);
		assert(manualV6.body.includes("Manual IPv6 network"));
		assert.equal((await trustedRequest("2001:db8:abcd:1::2")).status, 200);
		const listV6 = await trustedRequest("2001:db8:beef::2");
		assert.equal(listV6.status, 403);
		assert(listV6.body.includes("VPN list membership"));
		assert.equal((await trustedRequest("2001:db9::2")).status, 200);
		const phaseChecks = modsecurity ? 7 : 6;
		const log = await fs.readFile(
			path.join(temporary, "logs/ip_firewall_17.log"),
			"utf8",
		);
		const hits = log
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		assert(hits.length >= 8);
		assert(
			hits.every(
				(hit) => hit.status === 403 && hit.host_id === 17 && hit.request_id,
			),
		);
		assert(
			hits.some((hit) => hit.reason === "Operator <script>alert(1)</script>"),
		);
		let countryChecks = 0;
		if (geoipDatabase) {
			const countryRequest = (ip, options = {}) =>
				request(port, {
					host: "country.test",
					...options,
					headers: { "X-Real-IP": ip, ...options.headers },
				});
			const countryBlock = await countryRequest("81.2.69.160", {
				headers: { "Accept-Language": "de" },
			});
			assert.equal(countryBlock.status, 403);
			assert(!countryBlock.headers.location);
			assert(countryBlock.body.includes("gesperrten Land GB"));
			assert(countryBlock.body.includes("GeoIP-Länderregel"));
			assert(countryBlock.body.includes("Erkanntes Land (ISO)"));
			assert(countryBlock.body.includes("81.2.69.160"));
			assert.equal((await countryRequest("89.160.20.128")).status, 200);
			assert.equal((await countryRequest("203.0.113.1")).status, 200);
			const unknown = await countryRequest("203.0.113.1", {
				host: "unknown.test",
			});
			assert.equal(unknown.status, 403);
			assert(unknown.body.includes("could not be determined"));
			assert(unknown.body.includes("Unknown (XX)"));
			const custom = await countryRequest("81.2.69.160", {
				host: "countrycustom.test",
			});
			assert.equal(custom.status, 403);
			assert(
				custom.body.includes(
					"Country &lt;script&gt;&quot;policy&quot;&lt;/script&gt;",
				),
			);
			assert(!custom.body.includes("<script>"));
			assert.equal((await countryRequest("81.2.69.163")).status, 200);
			assert.equal(
				(await countryRequest("81.2.69.163", { uri: "/needs-auth" })).status,
				302,
			);
			assert(
				(await countryRequest("81.2.69.161")).body.includes(
					"Manual before country",
				),
			);
			assert(
				(await countryRequest("81.2.69.162")).body.includes(
					"List before country",
				),
			);
			for (const uri of [
				"/custom/path",
				"/spm-upload/file",
				"/.well-known/acme-challenge/folder/secret",
			])
				assert.equal(
					(await countryRequest("81.2.69.160", { uri })).status,
					403,
				);
			assert.equal(
				(
					await countryRequest("81.2.69.160", {
						uri: "/.well-known/acme-challenge/TOKEN-abc",
					})
				).status,
				200,
			);
			assert.equal(
				(await countryRequest("81.2.69.160", { ip: "127.0.0.2" })).status,
				200,
			);
			assert.equal(
				(await countryRequest("81.2.69.160", { host: "unfiltered.test" }))
					.status,
				200,
			);
			assert.equal(
				(await countryRequest("81.2.69.160", { host: "countryanubis.test" }))
					.status,
				403,
			);
			assert.equal(
				(await countryRequest("89.160.20.128", { host: "countryanubis.test" }))
					.status,
				200,
			);
			if (modsecurity) {
				const json = await countryRequest("81.2.69.160", {
					headers: { Accept: "application/json" },
				});
				assert.equal(json.status, 403);
				assert.equal(JSON.parse(json.body).country_code, "GB");
				assert.equal(JSON.parse(json.body).source, "GeoIP country rule");
				const unknownJson = await countryRequest("203.0.113.1", {
					host: "unknown.test",
					headers: { Accept: "application/json" },
				});
				assert.equal(JSON.parse(unknownJson.body).country_code, "XX");
			}
			const countryHits = (
				await fs.readFile(
					path.join(temporary, "logs/ip_firewall_20.log"),
					"utf8",
				)
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			assert(
				countryHits.every(
					(hit) =>
						hit.status === 403 &&
						hit.country_code === "GB" &&
						hit.ip.startsWith("81.2.69."),
				),
			);
			assert(countryHits.some((hit) => hit.source === "GeoIP country rule"));
			assert(!hits.some((hit) => "country_code" in hit));
			countryChecks = modsecurity ? 19 : 17;
		}
		let asnChecks = 0;
		if (asn) {
			const asnRequest = (ip, options = {}) =>
				request(port, {
					host: "asn.test",
					...options,
					headers: { "X-Real-IP": ip, ...options.headers },
				});
			const blocked = asn.blocked[0];
			const page = await asnRequest(blocked.ip, {
				headers: { "Accept-Language": "de" },
			});
			assert.equal(page.status, 403);
			assert(!page.headers.location);
			assert(page.body.includes(`AS${blocked.asn}`));
			assert(page.body.includes("gesperrten autonomen System"));
			assert(page.body.includes("ASN-Regel"));
			assert(page.body.includes(escapeHtml(blocked.organization)));
			assert(page.body.includes(blocked.ip));
			const english = await asnRequest(blocked.ip);
			assert(english.body.includes("blocked autonomous system"));
			assert.equal((await asnRequest(asn.allowed.ip)).status, 200);
			assert.equal((await asnRequest(asn.unknown.ip)).status, 200);
			assert.equal((await asnRequest(asn.blocked[3].ip)).status, 200);
			assert.equal(
				(await asnRequest(asn.blocked[3].ip, { uri: "/needs-auth" })).status,
				302,
			);
			assert(
				(await asnRequest(asn.blocked[1].ip)).body.includes(
					"Manual before ASN",
				),
			);
			assert(
				(await asnRequest(asn.blocked[2].ip)).body.includes("List before ASN"),
			);
			const custom = await asnRequest(blocked.ip, { host: "asncustom.test" });
			assert.equal(custom.status, 403);
			assert(
				custom.body.includes(
					"ASN &lt;script&gt;&quot;policy&quot;&lt;/script&gt;",
				),
			);
			assert(!custom.body.includes("<script>"));
			for (const uri of [
				"/custom/path",
				"/spm-upload/file",
				"/.well-known/acme-challenge/folder/secret",
			])
				assert.equal((await asnRequest(blocked.ip, { uri })).status, 403);
			assert.equal(
				(
					await asnRequest(blocked.ip, {
						uri: "/.well-known/acme-challenge/TOKEN-abc",
					})
				).status,
				200,
			);
			assert.equal(
				(await asnRequest(blocked.ip, { ip: "127.0.0.2" })).status,
				200,
			);
			assert.equal(
				(await asnRequest(blocked.ip, { host: "unfiltered.test" })).status,
				200,
			);
			assert.equal(
				(await asnRequest(blocked.ip, { host: "asnanubis.test" })).status,
				403,
			);
			assert.equal(
				(await asnRequest(asn.allowed.ip, { host: "asnanubis.test" })).status,
				200,
			);
			const info = await asnRequest(blocked.ip, { host: "asninfo.test" });
			assert.equal(info.status, 403);
			assert(info.body.includes("Manual with ASN information"));
			assert(info.body.includes(`AS${blocked.asn}`));
			assert(info.body.includes(escapeHtml(blocked.organization)));
			const unknownInfo = await asnRequest(asn.unknown.ip, {
				host: "asninfo.test",
			});
			assert.equal(unknownInfo.status, 403);
			assert(unknownInfo.body.includes("Unknown ASN information"));
			assert(!unknownInfo.body.includes("AS0"));
			if (geoipDatabase) {
				const overlap = await asnRequest(blocked.ip, {
					host: "asncountry.test",
				});
				assert.equal(overlap.status, 403);
				assert(overlap.body.includes("ASN rule"));
				assert(overlap.body.includes(asn.country || "Unknown (XX)"));
				asnChecks++;
			}
			if (asn.ipv6) {
				const ipv6 = await asnRequest(asn.ipv6.ip, { host: "asnv6.test" });
				assert.equal(ipv6.status, 403);
				assert(ipv6.body.includes(`AS${asn.ipv6.asn}`));
				assert(ipv6.body.includes(escapeHtml(asn.ipv6.organization)));
				asnChecks++;
			}
			if (modsecurity) {
				const json = await asnRequest(blocked.ip, {
					headers: { Accept: "application/json" },
				});
				assert.equal(json.status, 403);
				assert.equal(JSON.parse(json.body).asn, blocked.asn);
				assert.equal(
					JSON.parse(json.body).asn_organization,
					blocked.organization,
				);
				assert.equal(JSON.parse(json.body).source, "ASN rule");
				const unknownJson = JSON.parse(
					(
						await asnRequest(asn.unknown.ip, {
							host: "asninfo.test",
							headers: { Accept: "application/json" },
						})
					).body,
				);
				assert(!("asn" in unknownJson));
				assert(!("asn_organization" in unknownJson));
				asnChecks += 2;
			}
			const asnHits = (
				await fs.readFile(
					path.join(temporary, "logs/ip_firewall_30.log"),
					"utf8",
				)
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			assert(asnHits.some((hit) => hit.source === "ASN rule"));
			for (const hit of asnHits) {
				const expected = asn.blocked.find((record) => record.ip === hit.ip);
				assert(expected, `unexpected ASN log address ${hit.ip}`);
				assert.equal(hit.status, 403);
				assert.equal(hit.asn, String(expected.asn));
				assert.equal(hit.asn_organization, expected.organization);
			}
			const infoHits = (
				await fs.readFile(
					path.join(temporary, "logs/ip_firewall_33.log"),
					"utf8",
				)
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			assert(
				infoHits.some(
					(hit) =>
						hit.ip === blocked.ip &&
						hit.asn === String(blocked.asn) &&
						hit.asn_organization === blocked.organization,
				),
			);
			assert(
				infoHits.some(
					(hit) =>
						hit.ip === asn.unknown.ip &&
						hit.asn === "" &&
						hit.asn_organization === "",
				),
			);
			asnChecks += 24;
		}
		const writerChecks = geoipDatabase
			? await checkGeoipVariableWriters({
					nginx,
					modules,
					directory: temporary,
					database: geoipDatabase,
					luaPackagePath,
					luaPackageCpath,
				})
			: 0;
		const asnWriterChecks = asn
			? await checkAsnVariableWriters({
					nginx,
					modules,
					directory: temporary,
					database: asnDatabase,
					countryDatabase: geoipDatabase,
					probe: asn,
					luaPackagePath,
					luaPackageCpath,
				})
			: 0;
		const missingAsnChecks = asn
			? await checkMissingAsnLookup({
					nginx,
					modules,
					directory: temporary,
					optional: asns[3],
					required: asns[0],
					blocked: asn.blocked[0],
					luaPackagePath,
					luaPackageCpath,
					modsecurity,
				})
			: 0;
		const pageSerializationChecks = await checkLuaPageSerialization({
			nginx,
			modules,
			directory: temporary,
			luaPackagePath,
			luaPackageCpath,
		});
		const textSerializationChecks = await checkFirewallTextSerialization({
			nginx,
			modules,
			directory: temporary,
			luaPackagePath,
			luaPackageCpath,
			modsecurity,
		});
		const acmeChecks = await checkAcmeAuthentication({
			nginx,
			modules,
			directory: temporary,
			luaPackagePath,
			luaPackageCpath,
			modsecurity,
		});
		const ipv6UpstreamChecks = await checkIpv6Upstreams({
			nginx,
			modules,
			directory: temporary,
			luaPackagePath,
			luaPackageCpath,
		});
		return {
			checks:
				25 +
				countryChecks +
				asnChecks +
				phaseChecks +
				writerChecks +
				asnWriterChecks +
				missingAsnChecks +
				pageSerializationChecks +
				textSerializationChecks +
				acmeChecks +
				ipv6UpstreamChecks,
			mode: modsecurity ? "full modules" : "portable Lua/geo",
			hits: hits.length,
		};
	} catch (error) {
		throw new Error(`${error.message}\n${output}`, { cause: error });
	} finally {
		if (process && process.exitCode === null) {
			process.kill("SIGTERM");
			await new Promise((resolve) => process.once("exit", resolve));
		}
		if (upstream.listening) await close(upstream);
		await fs.rm(temporary, { recursive: true, force: true });
	}
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const nginx = process.env.NGINX_BIN || "nginx";
	const discovered =
		process.env.NGINX_SMOKE_DISCOVER_MODULES === "true"
			? await resolveNginxSmokeModules({
					version: await utils.execFile(nginx, ["-V"]),
					configuration: await utils.execFile(nginx, ["-e", "stderr", "-T"], {
						maxBuffer: 8 * 1024 * 1024,
					}),
				})
			: {};
	if (process.env.NGINX_REQUIRE_ASN_STARTUP === "true") {
		const status = await getFirewallGeoipStatus();
		assert.equal(
			status.available,
			true,
			"startup Country lookup must remain ready",
		);
		assert.equal(
			status.asn?.available,
			true,
			"startup must install the ASN lookup",
		);
		const configuration = await utils.execFile(nginx, ["-e", "stderr", "-T"], {
			maxBuffer: 8 * 1024 * 1024,
		});
		assert.equal(
			configuration.split("# ShieldPM managed ASN GeoIP2 BEGIN").length - 1,
			1,
			"startup ASN block must occur once",
		);
	}
	const result = await runIpFirewallSmoke({
		nginx,
		modules: [
			process.env.NGINX_NDK_MODULE || discovered.ndk,
			process.env.NGINX_LUA_MODULE || discovered.lua,
			process.env.NGINX_MODSECURITY_MODULE || discovered.modsecurity,
			process.env.NGINX_GEOIP2_MODULE || discovered.geoip2,
		].filter(Boolean),
		luaPackagePath: process.env.LUA_PACKAGE_PATH,
		luaPackageCpath: process.env.LUA_PACKAGE_CPATH,
		modsecurity:
			Boolean(process.env.NGINX_MODSECURITY_MODULE) ||
			Boolean(discovered.modsecurity) ||
			process.env.NGINX_MODSECURITY_STATIC === "true" ||
			process.env.NGINX_REQUIRE_MODSECURITY === "true",
		tcpInternal: process.env.NGINX_SMOKE_TCP_INTERNAL === "true",
		geoipDatabase: process.env.NGINX_GEOIP_DATABASE,
		asnDatabase: process.env.NGINX_ASN_DATABASE,
	});
	console.log(
		`IP firewall smoke passed: ${result.checks} checks (${result.mode}), ${result.hits} logged denials`,
	);
}
