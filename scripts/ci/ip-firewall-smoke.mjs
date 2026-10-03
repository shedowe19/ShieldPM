import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { getFirewallGeoipStatus } from "../../backend/lib/firewall-geoip.js";
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
    ${variant.http}
    server {
        listen 127.0.0.1:${port};
        set_real_ip_from 127.0.0.1; real_ip_header X-Real-IP;
        ${variant.server}
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
	return variants.length;
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
		const render = async (id, hostPolicy = policy, hostLists = lists) => {
			const firewall = await buildFirewallRender(
				{ id, enabled: true, meta: { ip_firewall: hostPolicy } },
				hostLists,
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
    ${primary.geo}
    ${anubis.geo}
    ${trusted.geo}
    ${countries.map((country) => country.geo).join("\n")}
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
		return {
			checks: 24 + countryChecks + phaseChecks + writerChecks,
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
					configuration: await utils.execFile(nginx, ["-T"], {
						maxBuffer: 8 * 1024 * 1024,
					}),
				})
			: {};
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
	});
	console.log(
		`IP firewall smoke passed: ${result.checks} checks (${result.mode}), ${result.hits} logged denials`,
	);
}
