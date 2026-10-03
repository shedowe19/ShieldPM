import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { buildFirewallRender } from "../../backend/lib/firewall-render.js";
import utils from "../../backend/lib/utils.js";

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
			allowlist: ["127.0.0.1", "::ffff:127.0.0.3"],
			denylist: [
				{
					address: "::ffff:127.0.0.2",
					reason: "Operator <script>alert(1)</script>",
				},
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
				entries: ["127.0.0.0/24"],
			},
			{
				id: 10,
				name: "Specific network",
				reason: "Specific list policy",
				entries: ["::ffff:127.0.0.4/128"],
			},
		];
		const engine = utils.getRenderEngine();
		const render = async (id) => {
			const firewall = await buildFirewallRender(
				{ id, enabled: true, meta: { ip_firewall: policy } },
				lists,
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
    ${primary.geo}
    ${anubis.geo}
    ${trusted.geo}
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
        location / { proxy_pass http://127.0.0.1:${upstreamPort}; }
    }
    server {
        listen 127.0.0.1:${port}; server_name unfiltered.test;
        location / { proxy_pass http://127.0.0.1:${upstreamPort}; }
    }
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
		return {
			checks: 24,
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
	const result = await runIpFirewallSmoke({
		nginx: process.env.NGINX_BIN || "nginx",
		modules: [
			process.env.NGINX_NDK_MODULE,
			process.env.NGINX_LUA_MODULE,
			process.env.NGINX_MODSECURITY_MODULE,
		].filter(Boolean),
		luaPackagePath: process.env.LUA_PACKAGE_PATH,
		luaPackageCpath: process.env.LUA_PACKAGE_CPATH,
		modsecurity:
			Boolean(process.env.NGINX_MODSECURITY_MODULE) ||
			process.env.NGINX_MODSECURITY_STATIC === "true",
		tcpInternal: process.env.NGINX_SMOKE_TCP_INTERNAL === "true",
	});
	console.log(
		`IP firewall smoke passed: ${result.checks} checks (${result.mode}), ${result.hits} logged denials`,
	);
}
