import { execFileSync, spawn } from "node:child_process";
import dgram from "node:dgram";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hosts: new Map() }));
vi.mock("../../internal/proxy-host.js", () => ({
	default: {
		get: async (_access, { id }) => {
			const row = state.hosts.get(id);
			if (!row) throw new Error("Host missing");
			return row;
		},
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: async () => {} } }));
vi.mock("../../internal/anubis.js", () => ({ default: {} }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test" }));

import traffic, { prepareTrafficFiles } from "../../internal/host-traffic-policy.js";
import nginx from "../../internal/nginx.js";

const binary = process.env.TRAFFIC_SMOKE_NGINX_BIN;
const suite = binary ? describe : describe.skip;
const request = (port, host, uri = "/", headers = {}, method = "GET") =>
	new Promise((resolve, reject) => {
		const req = http.request(
			{ hostname: "127.0.0.1", port, path: uri, method, agent: false, headers: { Host: host, ...headers } },
			(res) => {
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => (body += chunk));
				res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
			},
		);
		req.on("error", reject);
		req.setTimeout(4000, () => req.destroy(new Error("request timeout")));
		req.end(method === "POST" ? "body" : undefined);
	});
const freePort = async () => {
	const server = net.createServer();
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = server.address().port;
	await new Promise((resolve) => server.close(resolve));
	return port;
};
const start = async (server, address = "127.0.0.1", port = 0) => {
	await new Promise((resolve) => server.listen(port, address, resolve));
	return server.address().port;
};
const close = async (server) => {
	server.closeAllConnections?.();
	if (server.listening) await new Promise((resolve) => server.close(resolve));
};
const target = (id, port, patch = {}) => ({
	id,
	host: "127.0.0.1",
	port,
	weight: 1,
	max_fails: 1,
	fail_timeout: 1,
	backup: false,
	...patch,
});
const host = (id, name, port, meta = {}, patch = {}) => ({
	id,
	enabled: true,
	domain_names: [name],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: port,
	certificate_id: 0,
	access_list_id: 0,
	advanced_config: "",
	meta,
	...patch,
});
suite("actual Nginx traffic policies", () => {
	let directory;
	let dataDirectory;
	let port;
	let processHandle;
	const origins = [];
	const count = new Map();
	const received = [];
	let primaryPort;
	let canaryPort;
	let backupPort;
	let tlsPort;
	let ipv6Port;
	let dns;
	let primaryMode = "normal";
	const primary = http.createServer((req, res) => {
		const key = `${req.method}:${req.url}`;
		count.set(key, (count.get(key) || 0) + 1);
		received.push({ target: "primary", method: req.method, host: req.headers.host });
		if (primaryMode === "503") {
			res.statusCode = 503;
			res.end("primary unavailable");
			return;
		}
		if (req.url === "/private.css") res.setHeader("Cache-Control", "private, no-store");
		if (req.url === "/cookie.css") res.setHeader("Set-Cookie", "session=private");
		res.end(`primary:${count.get(key)}`);
	});
	const canary = http.createServer((_req, res) => res.end("canary"));
	const backup = http.createServer((req, res) => {
		received.push({ target: "backup", method: req.method });
		res.end("backup");
	});
	beforeAll(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-traffic-smoke-"));
		dataDirectory = path.join(directory, "data");
		await fs.mkdir(path.join(dataDirectory, "logs"), { recursive: true });
		await fs.mkdir(path.join(dataDirectory, "custom_nginx"), { recursive: true });
		await fs.mkdir(path.join(dataDirectory, "nginx"), { recursive: true });
		await fs.writeFile(path.join(dataDirectory, "custom_nginx/server_proxy.conf"), "");
		await fs.mkdir(path.join(directory, "logs"));
		vi.stubEnv("DATA_PATH", dataDirectory);
		vi.stubEnv("DISABLE_HTTP", "false");
		vi.stubEnv("DISABLE_IPV6", "true");
		vi.stubEnv("IPV4_BINDING", "127.0.0.1");
		vi.stubEnv("LISTEN_PROXY_PROTOCOL", "false");
		vi.stubEnv("DEMO_MODE", "false");
		port = await freePort();
		vi.stubEnv("HTTP_PORT", String(port));
		primaryPort = await start(primary);
		canaryPort = await start(canary);
		backupPort = await start(backup);
		origins.push(primary, canary, backup);
		primary.on("upgrade", (_req, socket) => {
			socket.end("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
		});
		const key = path.join(directory, "key.pem");
		const cert = path.join(directory, "cert.pem");
		execFileSync(
			"openssl",
			[
				"req",
				"-x509",
				"-newkey",
				"rsa:2048",
				"-nodes",
				"-days",
				"1",
				"-subj",
				"/CN=origin.example.test",
				"-keyout",
				key,
				"-out",
				cert,
			],
			{ stdio: "ignore" },
		);
		const tlsOrigin = https.createServer(
			{ key: await fs.readFile(key), cert: await fs.readFile(cert) },
			(req, res) => res.end(JSON.stringify({ sni: req.socket.servername, host: req.headers.host })),
		);
		tlsPort = await start(tlsOrigin);
		origins.push(tlsOrigin);
		const ipv6 = http.createServer((_req, res) => res.end("ipv6 reached"));
		ipv6Port = await start(ipv6, "::1");
		origins.push(ipv6);
		// A private authoritative fixture keeps hostname upload tests independent of external DNS.
		dns = dgram.createSocket("udp4");
		dns.on("message", (query, remote) => {
			let end = 12;
			while (query[end]) end += query[end] + 1;
			end += 5;
			const header = Buffer.alloc(12);
			query.copy(header, 0, 0, 2);
			header.writeUInt16BE(0x8180, 2);
			header.writeUInt16BE(1, 4);
			const answer =
				query.readUInt16BE(end - 4) === 1
					? Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4, 127, 0, 0, 1])
					: Buffer.alloc(0);
			header.writeUInt16BE(answer.length ? 1 : 0, 6);
			dns.send(Buffer.concat([header, query.subarray(12, end), answer]), remote.port, remote.address);
		});
		await new Promise((resolve) => dns.bind(0, "127.0.0.1", resolve));
		const basePool = { enabled: true, tls_verify: false, connect_timeout: 1, read_timeout: 3 };
		const hosts = [
			host(1, "weighted.example.test", primaryPort, {
				upstream_pool: {
					...basePool,
					targets: [target("main", primaryPort, { weight: 3 }), target("canary", canaryPort)],
				},
			}),
			host(2, "failover.example.test", primaryPort, {
				upstream_pool: {
					...basePool,
					targets: [target("main", primaryPort), target("backup", backupPort, { backup: true })],
				},
			}),
			host(3, "cached.example.test", primaryPort, {
				cache_policy: {
					enabled: true,
					assets_only: false,
					routes: [
						{ path: "/", ttl_seconds: 60 },
						{ path: "/short/", ttl_seconds: 1 },
					],
				},
			}),
			host(
				4,
				"tls.example.test",
				tlsPort,
				{
					upstream_pool: {
						...basePool,
						host_header: "app.example.test",
						tls_server_name: "origin.example.test",
						targets: [target("tls", tlsPort)],
					},
				},
				{ forward_scheme: "https" },
			),
			host(
				5,
				"ipv6.example.test",
				ipv6Port,
				{},
				{
					forward_host: "::1",
					upload_relay_enabled: true,
					upload_relay_chunk_size: 83886080,
					upload_relay_path: "/_shieldpm-upload",
				},
			),
		];
		hosts.push(
			host(
				6,
				"ipv6-bracketed.example.test",
				ipv6Port,
				{},
				{
					forward_host: "[::1]",
					upload_relay_enabled: true,
					upload_relay_chunk_size: 83886080,
					upload_relay_path: "/_shieldpm-upload",
				},
			),
			host(
				7,
				"ipv4.example.test",
				primaryPort,
				{},
				{
					upload_relay_enabled: true,
					upload_relay_chunk_size: 83886080,
					upload_relay_path: "/_shieldpm-upload",
				},
			),
		);
		hosts.push(
			host(
				8,
				"tls-verified.example.test",
				tlsPort,
				{
					upstream_pool: {
						...basePool,
						tls_verify: true,
						tls_server_name: "origin.example.test",
						targets: [target("tls", tlsPort)],
					},
				},
				{ forward_scheme: "https" },
			),
			host(
				9,
				"protected.example.test",
				primaryPort,
				{ cache_policy: { enabled: true, assets_only: false } },
				{
					access_list_id: 1,
					access_list: {
						id: 1,
						items: [],
						clients: [{ directive: "allow", address: "all" }],
						satisfy_any: false,
						pass_auth: false,
					},
				},
			),
		);

		hosts.push(
			host(
				10,
				"dns.example.test",
				primaryPort,
				{},
				{
					forward_host: "origin.fixture.test",
					upload_relay_enabled: true,
					upload_relay_chunk_size: 83886080,
					upload_relay_path: "/_shieldpm-upload",
				},
			),
		);

		for (const row of hosts) {
			if (row.id === 2 || row.id === 4)
				Object.assign(row, {
					upload_relay_enabled: true,
					upload_relay_chunk_size: 83886080,
					upload_relay_path: "/_shieldpm-upload",
				});
			state.hosts.set(row.id, row);
			await prepareTrafficFiles(row);
		}
		await fs.mkdir(path.join(directory, "conf.d/include"), { recursive: true });
		if (process.env.TRAFFIC_SMOKE_INCLUDE_DIRECTORY)
			await fs.cp(process.env.TRAFFIC_SMOKE_INCLUDE_DIRECTORY, path.join(directory, "conf.d"), {
				recursive: true,
			});
		else
			await fs.writeFile(
				path.join(directory, "conf.d/include/proxy-headers.conf"),
				`proxy_set_header Host $host$is_request_port$request_port;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
`,
			);
		const generated = [];
		for (const row of hosts) {
			let text = await nginx.renderConfig("proxy_host", row);
			text = text.replaceAll(" /data/", ` ${dataDirectory}/`);
			// Transport smoke isolates ModSecurity body limits; the dedicated WAF smoke validates those directives.
			if (row.upload_relay_enabled) text = text.replace(/^\s*modsecurity_rules .*\n/gm, "");
			generated.push(text);
		}
		await fs.writeFile(path.join(directory, "hosts.conf"), generated.join("\n"));
		const luaPath = process.env.TRAFFIC_SMOKE_LUA_DIRECTORY || "/usr/local/share/lua/5.1";
		const master = `user root;pid ${directory}/nginx.pid;error_log ${directory}/error.log;events{}http{resolver 127.0.0.1:${dns.address().port} ipv6=off;lua_package_path "${luaPath}/?.lua;;";access_log off;log_format json_analytics '$status';map $http_upgrade $connection_upgrade {default upgrade;"" close;}client_body_temp_path ${directory}/body;proxy_temp_path ${directory}/proxy;fastcgi_temp_path ${directory}/fastcgi;uwsgi_temp_path ${directory}/uwsgi;scgi_temp_path ${directory}/scgi;include ${directory}/hosts.conf;}`;
		const masterPath = path.join(directory, "nginx.conf");
		await fs.writeFile(masterPath, master);
		execFileSync(binary, ["-p", directory, "-c", masterPath, "-tq"], { stdio: "pipe" });
		processHandle = spawn(binary, ["-p", directory, "-c", masterPath, "-g", "daemon off; master_process off;"], {
			stdio: "ignore",
		});
		let ready = false;
		for (let i = 0; i < 80; i++) {
			try {
				await request(port, "weighted.example.test");
				ready = true;
				break;
			} catch {
				if (processHandle.exitCode !== null)
					throw new Error(await fs.readFile(path.join(directory, "error.log"), "utf8"));
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		}
		expect(ready).toBe(true);
	}, 20000);
	afterAll(async () => {
		await traffic.stop();
		if (processHandle?.exitCode === null) {
			const exited = new Promise((resolve) => processHandle.once("exit", resolve));
			processHandle.kill("SIGTERM");
			await exited;
		}
		await Promise.all(origins.map(close));
		if (dns) await new Promise((resolve) => dns.close(resolve));
		vi.unstubAllEnvs();
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	it("distributes actual requests using 3:1 canary weights", async () => {
		const responses = [];
		for (let i = 0; i < 40; i++) responses.push(await request(port, "weighted.example.test"));
		const canaries = responses.filter((row) => row.body === "canary").length;
		expect(canaries).toBeGreaterThanOrEqual(9);
		expect(canaries).toBeLessThanOrEqual(11);
		expect(responses.every((row) => row.status === 200)).toBe(true);
	});
	it("fails over GET, never replays a dispatched POST, and recovers primary traffic", async () => {
		primaryMode = "503";
		const initialBackupPosts = received.filter((row) => row.target === "backup" && row.method === "POST").length;
		const post = await request(port, "failover.example.test", "/submit", {}, "POST");
		expect(post.status).toBe(503);
		expect(received.filter((row) => row.target === "backup" && row.method === "POST")).toHaveLength(
			initialBackupPosts,
		);
		const get = await request(port, "failover.example.test");
		expect(get.body).toBe("backup");
		primaryMode = "normal";
		await new Promise((resolve) => setTimeout(resolve, 2100));
		expect((await request(port, "failover.example.test")).body).toMatch(/^primary:/);
	});
	it("preserves upstream Host and TLS SNI independently", async () => {
		const result = await request(port, "tls.example.test", "/_shieldpm-upload");
		expect(result.status).toBe(200);
		expect(JSON.parse(result.body)).toEqual({ host: "app.example.test", sni: "origin.example.test" });
	});
	it("rejects an untrusted TLS certificate when pool verification is enabled", async () => {
		expect((await request(port, "tls-verified.example.test")).status).toBe(502);
	});
	it("never serves shared cache entries to access-list protected hosts", async () => {
		const first = await request(port, "protected.example.test", "/protected.css");
		const next = await request(port, "protected.example.test", "/protected.css");
		expect(first.headers["x-shieldpm-cache"]).toBe("BYPASS");
		expect(next.headers["x-shieldpm-cache"]).toBe("BYPASS");
		expect(next.body).not.toBe(first.body);
	});
	it("passes an actual WebSocket handshake through the pool", async () => {
		const status = await new Promise((resolve, reject) => {
			const req = http.request({
				hostname: "127.0.0.1",
				port,
				path: "/ws",
				agent: false,
				headers: { Host: "failover.example.test", Upgrade: "websocket", Connection: "Upgrade" },
			});
			req.on("upgrade", (response, socket) => {
				socket.destroy();
				resolve(response.statusCode);
			});
			req.on("response", (res) => {
				res.resume();
				resolve(res.statusCode);
			});
			req.on("error", reject);
			req.end();
		});
		expect(status).toBe(101);
	});
	it("caches public GET/HEAD, bypasses credentials and honors origin privacy", async () => {
		const first = await request(port, "cached.example.test", "/public.css");
		const second = await request(port, "cached.example.test", "/public.css");
		expect(first.headers["x-shieldpm-cache"]).toBe("MISS");
		expect(second.headers["x-shieldpm-cache"]).toBe("HIT");
		expect(second.body).toBe(first.body);
		expect(
			(await request(port, "cached.example.test", "/public.css", {}, "HEAD")).headers["x-shieldpm-cache"],
		).toBe("HIT");
		for (const headers of [{ Authorization: "Bearer private" }, { Cookie: "session=private" }])
			expect(
				(await request(port, "cached.example.test", "/public.css", headers)).headers["x-shieldpm-cache"],
			).toBe("BYPASS");
		for (const uri of ["/private.css", "/cookie.css"]) {
			await request(port, "cached.example.test", uri);
			expect((await request(port, "cached.example.test", uri)).headers["x-shieldpm-cache"]).toBe("MISS");
		}
	});
	it("expires route TTL and purges the exact authorized URI", async () => {
		const first = await request(port, "cached.example.test", "/short/a.css");
		expect((await request(port, "cached.example.test", "/short/a.css")).body).toBe(first.body);
		await new Promise((resolve) => setTimeout(resolve, 2100));
		const expired = await request(port, "cached.example.test", "/short/a.css");
		expect(expired.body).not.toBe(first.body);
		expect(expired.headers["x-shieldpm-cache"]).toBe("EXPIRED");
		const access = { can: async () => true };
		const result = await traffic.purgeCache(access, 3, { path: "/public.css" });
		expect(result.removed).toBeGreaterThan(0);
		expect((await request(port, "cached.example.test", "/public.css")).headers["x-shieldpm-cache"]).toBe("MISS");
		const status = await traffic.cacheStatus(access, 3);
		expect(status.counts.HIT).toBeGreaterThan(0);
		expect(status.counts.BYPASS).toBeGreaterThan(0);
	});
	it("reaches IPv4, DNS, bare/bracketed IPv6 and pool upstreams through public upload paths", async () => {
		for (const name of [
			"ipv6.example.test",
			"ipv6-bracketed.example.test",
			"ipv4.example.test",
			"dns.example.test",
			"failover.example.test",
		])
			for (const uri of ["/_shieldpm-upload", "/_shieldpm-upload/id", "/remote.php/dav/uploads/abc"]) {
				const response = await request(port, name, uri);
				expect(
					response.status,
					`${name}${uri}: ${await fs.readFile(path.join(directory, "error.log"), "utf8")}`,
				).toBe(200);
				expect(response.body).toMatch(name.startsWith("ipv6") ? /ipv6 reached/ : /^primary:/);
			}
	});
});
