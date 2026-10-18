import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import http2 from "node:http2";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: {} }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test" }));
vi.mock("../../lib/encryption.js", () => ({
	encrypt: (value) => `sealed:${Buffer.from(value).toString("base64")}`,
	decrypt: (value) => Buffer.from(value.slice(7), "base64").toString(),
}));

import nginx from "../../internal/nginx.js";
import { stopWasiHostBridges } from "../../internal/wasi-host-bridge.js";
import { markHostActive, prepareHost, prepareWasmFilters } from "../../internal/wasm.js";
import artifacts from "../../internal/wasm-artifacts.js";
import { validateModuleBytes } from "../../internal/wasm-modules.js";

const binary = process.env.SHIELDPM_WASM_NGINX_BINARY;
const suite = binary ? describe : describe.skip;
const domain = "wasi-host.example.test";
const access = { can: async () => true };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const listen = async (server) => {
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return server.address().port;
};
const request = (port, { method = "GET", uri = "/", body = "", headers = {}, chunked = false } = {}) =>
	new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: "127.0.0.1",
				port,
				method,
				path: uri,
				agent: false,
				headers: {
					Host: domain,
					...(body.length && !chunked ? { "Content-Length": Buffer.byteLength(body) } : {}),
					...(chunked ? { "Transfer-Encoding": "chunked" } : {}),
					...headers,
				},
				timeout: 5000,
			},
			(res) => {
				const chunks = [];
				res.on("data", (chunk) => chunks.push(chunk));
				res.on("error", reject);
				res.on("end", () =>
					resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
				);
			},
		);
		req.on("error", reject);
		req.on("timeout", () => req.destroy(new Error("WASI host request timed out")));
		if (chunked) {
			const bytes = Buffer.from(body);
			req.write(bytes.subarray(0, Math.floor(bytes.length / 2)));
			req.end(bytes.subarray(Math.floor(bytes.length / 2)));
		} else req.end(body);
	});
const h2Request = (port, body) =>
	new Promise((resolve, reject) => {
		const session = http2.connect(`http://127.0.0.1:${port}`);
		const req = session.request({ ":method": "POST", ":authority": domain, ":path": "/h2" });
		let headers;
		const chunks = [];
		const fail = (error) => {
			session.destroy();
			reject(error);
		};
		session.on("error", fail);
		req.on("error", fail);
		req.on("response", (value) => {
			headers = value;
		});
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => {
			session.close();
			resolve({ status: headers[":status"], headers, body: Buffer.concat(chunks) });
		});
		req.end(body);
	});
const hostlessRequest = (port) =>
	new Promise((resolve, reject) => {
		const socket = net.connect(port, "127.0.0.1", () => socket.write("GET /hostless HTTP/1.0\r\n\r\n"));
		const chunks = [];
		socket.on("data", (chunk) => chunks.push(chunk));
		socket.on("error", reject);
		socket.on("end", () => {
			const bytes = Buffer.concat(chunks);
			const boundary = bytes.indexOf("\r\n\r\n");
			resolve({
				status: Number(bytes.subarray(0, boundary).toString().split(" ")[1]),
				body: bytes.subarray(boundary + 4),
			});
		});
	});

suite("genuine generated proxy hosts with standalone WASI commands", () => {
	let directory;
	let data;
	let port;
	let origin;
	let originPort;
	let child;
	let hits = 0;
	const applications = {};
	const hostFile = () => path.join(directory, "host.conf");
	const pointerFile = () => path.join(data, "wasm/active/host-77.json");
	const application = (name, { mode = "handler", protocol = "stdio", settings = {}, failure = "closed" } = {}) => ({
		id: "application",
		kind: "application",
		enabled: true,
		failure_mode: failure,
		config: { application_id: applications[name].id, mode, protocol, settings },
	});
	const row = (filters) => ({
		id: 77,
		enabled: true,
		domain_names: [domain],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: originPort,
		certificate_id: 0,
		access_list_id: 0,
		advanced_config: "http2 on; client_body_buffer_size 1k;",
		locations: [{ path: "/custom", forward_scheme: "http", forward_host: "127.0.0.1", forward_port: originPort }],
		meta: { wasm_filters: filters },
	});
	const stop = async () => {
		if (child?.exitCode === null) {
			const ended = new Promise((resolve) => child.once("close", resolve));
			child.kill("SIGTERM");
			await ended;
		}
	};
	const start = async (filters) => {
		const host = row(await prepareWasmFilters(filters));
		host.wasm = await prepareHost(host);
		await fs.writeFile(
			hostFile(),
			(await nginx.renderConfig("proxy_host", host)).replaceAll(" /data/", ` ${data}/`),
		);
		execFileSync(binary, ["-p", `${directory}/`, "-c", path.join(directory, "nginx.conf"), "-tq"], {
			stdio: "pipe",
		});
		child = spawn(
			binary,
			["-p", `${directory}/`, "-c", path.join(directory, "nginx.conf"), "-g", "daemon off; master_process off;"],
			{ stdio: "ignore" },
		);
		for (let attempt = 0; attempt < 60; attempt++) {
			try {
				await request(port);
				await markHostActive(host.id, host.wasm);
				return host;
			} catch {
				if (child.exitCode !== null)
					throw new Error(await fs.readFile(path.join(directory, "error.log"), "utf8"));
				await sleep(25);
			}
		}
		throw new Error("Generated WASI host did not become ready");
	};
	beforeAll(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasi-host-runtime-"));
		data = path.join(directory, "data");
		for (const target of ["logs", "custom_nginx", "nginx"])
			await fs.mkdir(path.join(data, target), { recursive: true });
		await fs.mkdir(path.join(directory, "logs"));
		await fs.mkdir(path.join(directory, "conf.d/include"), { recursive: true });
		await fs.writeFile(path.join(data, "custom_nginx/server_proxy.conf"), "");
		await fs.writeFile(
			path.join(directory, "conf.d/include/proxy-headers.conf"),
			"proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade;\n",
		);
		origin = http.createServer((req, res) => {
			hits++;
			const chunks = [];
			req.on("data", (chunk) => chunks.push(chunk));
			req.on("end", () =>
				res.end(
					JSON.stringify({
						method: req.method,
						headers: req.headers,
						body_base64: Buffer.concat(chunks).toString("base64"),
					}),
				),
			);
		});
		originPort = await listen(origin);
		const reserved = net.createServer();
		port = await listen(reserved);
		await new Promise((resolve) => reserved.close(resolve));
		for (const [key, value] of Object.entries({
			DATA_PATH: data,
			SHIELDPM_NGINX_CONF: path.join(directory, "nginx.conf"),
			DISABLE_HTTP: "false",
			DISABLE_IPV6: "true",
			IPV4_BINDING: "127.0.0.1",
			HTTP_PORT: String(port),
			LISTEN_PROXY_PROTOCOL: "false",
			DEMO_MODE: "false",
			ACME_OCSP_STAPLING: "false",
			CUSTOM_OCSP_STAPLING: "false",
		}))
			vi.stubEnv(key, value);
		const luaPath =
			process.env.SHIELDPM_WASM_LUA_PATH ||
			"/usr/local/share/lua/5.1/?.lua;/usr/local/share/lua/5.1/?/init.lua;;";
		const cpath = process.env.SHIELDPM_WASM_LUA_CPATH
			? `lua_package_cpath ${JSON.stringify(process.env.SHIELDPM_WASM_LUA_CPATH)};`
			: "";
		await fs.writeFile(
			path.join(directory, "nginx.conf"),
			`user root; pid ${directory}/pid; error_log ${directory}/error.log info; events {worker_connections 128;} http {
wasm_vm wasmtime;
lua_package_path ${JSON.stringify(luaPath)}; ${cpath} access_log off; log_format json_analytics '$status'; map $http_upgrade $connection_upgrade {default upgrade;'' close;} client_body_temp_path ${directory}/body; proxy_temp_path ${directory}/proxy; include ${directory}/host.conf;}`,
		);
		for (const name of ["stdio", "filter", "response", "inspect", "trap", "infinite"]) {
			const filename = ["trap", "infinite"].includes(name)
				? `standalone-wasi-${name}.wasm`
				: `standalone-wasi-http-${name}.wasm`;
			const bytes = await fs.readFile(new URL(`../fixtures/${filename}`, import.meta.url));
			const uploaded = await artifacts.upload(access, bytes, { name: `HTTP ${name}`, filename });
			expect(uploaded.runtime).toBe("wasi-preview1");
			applications[name] = uploaded.artifact;
		}
		const uploaded = await artifacts.upload(
			access,
			await fs.readFile(new URL("../fixtures/custom-proxy-wasm.wasm", import.meta.url)),
			{ name: "HTTP callback ordering", filename: "callback-ordering.wasm" },
		);
		expect(uploaded.runtime).toBe("proxy-wasm");
		applications.module = uploaded.artifact;
	}, 15000);
	afterEach(stop);
	afterAll(async () => {
		await stop();
		await stopWasiHostBridges();
		origin?.closeAllConnections?.();
		if (origin?.listening) await new Promise((resolve) => origin.close(resolve));
		vi.unstubAllEnvs();
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	it("routes an independent command through automatic upload instead of requiring the Proxy-Wasm ABI", async () => {
		const bytes = await fs.readFile(new URL("../fixtures/standalone-wasi-http-stdio.wasm", import.meta.url));
		await expect(validateModuleBytes(bytes)).rejects.toThrow(/standalone WASI Preview 1/);
		await start([application("stdio")]);
		const before = hits;
		const result = await request(port, { method: "POST", body: "independent application\n" });
		expect(result.status).toBe(200);
		expect(result.headers["content-type"]).toBe("text/plain; charset=utf-8");
		expect(result.body.toString()).toBe("independent application\n");
		expect(hits).toBe(before);
	}, 15000);
	it("passes explicit arguments, environment and reserved request metadata to the actual command", async () => {
		await start([
			application("stdio", {
				settings: { args: ["diagnostics"], env: [{ name: "EXPLICIT_HTTP_TEST", value: "present" }] },
			}),
		]);
		const result = await request(port, { method: "POST", uri: "/custom/path?hello=world", body: "body marker" });
		expect(result.status).toBe(200);
		const output = result.body.toString();
		for (const text of [
			"application.wasm\ndiagnostics\n",
			"EXPLICIT_HTTP_TEST=present\n",
			"SHIELDPM_HTTP_METHOD=POST\n",
			"SHIELDPM_HTTP_URI=/custom/path?hello=world\n",
			"SHIELDPM_HTTP_QUERY=hello=world\n",
			`SHIELDPM_HTTP_HOST=${domain}\n`,
			"SHIELDPM_HTTP_SCHEME=http\n",
		])
			expect(output).toContain(text);
		expect(output).toMatch(/SHIELDPM_HTTP_REMOTE_ADDR=127\.0\.0\.1\n/);
		expect(output.endsWith("body marker")).toBe(true);
		expect(output).not.toContain("PATH=");
	}, 15000);
	it.each(["HTTP/1.1 chunked", "HTTP/2 DATA"])(
		"preserves a disk-buffered UTF-8 body exactly over %s",
		async (transport) => {
			await start([application("stdio")]);
			const body = Buffer.from(`${"Grüße ☃\n".repeat(4096)}EOF`);
			expect(body.length).toBeGreaterThan(1024);
			const result =
				transport === "HTTP/2 DATA"
					? await h2Request(port, body)
					: await request(port, { method: "POST", body, chunked: true });
			expect(result.status).toBe(200);
			expect(result.body).toEqual(body);
			expect(await fs.readFile(path.join(directory, "error.log"), "utf8")).toContain(
				"a client request body is buffered to a temporary file",
			);
		},
		15000,
	);
	it("applies JSON request header removal/replacement and a binary body rewrite before the real upstream", async () => {
		await start([application("filter", { mode: "filter", protocol: "http-json-v1" })]);
		const before = hits;
		const result = await request(port, {
			method: "POST",
			body: "original",
			headers: { "X-Wasi-Filter": "spoofed", "X-Remove-Me": "discard" },
		});
		expect(result.status).toBe(200);
		const upstream = JSON.parse(result.body.toString());
		expect(upstream.headers["x-wasi-filter"]).toBe("trusted");
		expect(upstream.headers["x-remove-me"]).toBeUndefined();
		expect(Buffer.from(upstream.body_base64, "base64")).toEqual(Buffer.from("rewritten\0binary"));
		expect(upstream.headers["content-length"]).toBe(String(Buffer.byteLength("rewritten\0binary")));
		expect(hits).toBe(before + 1);
	}, 15000);
	it("returns custom status, headers and binary response bytes without contacting the upstream", async () => {
		await start([application("response", { protocol: "http-json-v1" })]);
		const before = hits;
		const result = await request(port);
		expect(result.status).toBe(207);
		expect(result.headers["x-wasi-response"]).toBe("independent");
		expect(result.headers["content-type"]).toBe("application/octet-stream");
		expect(result.body).toEqual(Buffer.from([0, 255, 128, 65, 10]));
		expect(hits).toBe(before);
		const head = await request(port, { method: "HEAD" });
		expect(head.status).toBe(207);
		expect(head.headers["x-wasi-response"]).toBe("independent");
		expect(head.body).toHaveLength(0);
	}, 15000);
	it("passes headerless HTTP/1.0 as an empty header array to the actual JSON command", async () => {
		await start([application("inspect", { protocol: "http-json-v1" })]);
		const result = await hostlessRequest(port);
		expect(result.status).toBe(200);
		const input = JSON.parse(result.body.toString());
		expect(input.version).toBe(1);
		expect(input.request.method).toBe("GET");
		expect(input.request.uri).toBe("/hostless");
		expect(input.request.headers).toEqual([]);
		expect(input.request.body_base64).toBe("");
	}, 15000);
	it.each(["HTTP/1.1 chunked", "HTTP/2 DATA"])(
		"delivers all 256 byte values at the 64 KiB limit through JSON stdin using %s",
		async (transport) => {
			await start([application("inspect", { protocol: "http-json-v1" })]);
			const body = Buffer.from(Array.from({ length: 65536 }, (_, index) => index & 255));
			const result =
				transport === "HTTP/2 DATA"
					? await h2Request(port, body)
					: await request(port, {
							method: "POST",
							uri: "/binary?escaped=%22%5C",
							body,
							chunked: true,
							headers: { "X-Quoted-Value": 'quote" and backslash\\' },
						});
			expect(result.status).toBe(200);
			const input = JSON.parse(result.body.toString());
			expect(input.request.method).toBe("POST");
			expect(Buffer.from(input.request.body_base64, "base64")).toEqual(body);
			if (transport === "HTTP/1.1 chunked") {
				expect(input.request.uri).toBe("/binary?escaped=%22%5C");
				expect(input.request.query).toBe("escaped=%22%5C");
				expect(
					input.request.headers.find((header) => header.name.toLowerCase() === "x-quoted-value")?.value,
				).toBe('quote" and backslash\\');
			}
		},
		15000,
	);
	it("executes earlier Proxy-Wasm body callbacks before a terminal WASI handler", async () => {
		const configuration = { ordering: "proved" };
		await start([
			{
				id: "proxy",
				kind: "module",
				enabled: true,
				failure_mode: "closed",
				config: { module_id: applications.module.id, configuration },
			},
			application("inspect", { protocol: "http-json-v1" }),
		]);
		const result = await request(port, { method: "POST", body: "body-before-handler" });
		expect(result.status).toBe(200);
		expect(result.headers["x-custom-chunks"]).toBe("1");
		expect(result.headers["x-custom-final"]).toBe("1");
		expect(result.headers["x-custom-response"]).toBe(JSON.stringify(configuration));
		const input = JSON.parse(result.body.toString());
		expect(input.request.headers.find((header) => header.name.toLowerCase() === "x-shieldpm-probe")?.value).toBe(
			"body-before-handler",
		);
		expect(Buffer.from(input.request.body_base64, "base64").toString()).toBe("body-before-handler");
	}, 15000);
	it("gives a later Proxy-Wasm callback the body changed by earlier WASI JSON middleware", async () => {
		await start([
			{
				...application("filter", { mode: "filter", protocol: "http-json-v1", settings: { args: ["ascii"] } }),
				id: "middleware",
			},
			{
				id: "proxy",
				kind: "module",
				enabled: true,
				failure_mode: "closed",
				config: { module_id: applications.module.id, configuration: {} },
			},
			application("inspect", { protocol: "http-json-v1" }),
		]);
		const result = await request(port, { method: "POST", body: "original before middleware" });
		expect(result.status).toBe(200);
		const input = JSON.parse(result.body.toString());
		expect(input.request.headers.find((header) => header.name.toLowerCase() === "x-shieldpm-probe")?.value).toBe(
			"rewritten_binary",
		);
		expect(Buffer.from(input.request.body_base64, "base64").toString()).toBe("rewritten_binary");
		expect(result.headers["x-custom-chunks"]).toBe("1");
		expect(result.headers["x-custom-final"]).toBe("1");
	}, 20000);
	it("rejects a fail-open Proxy-Wasm body trap before a terminal WASI handler can bypass it", async () => {
		const accepted = await start([application("stdio")]);
		const pointer = await fs.readFile(pointerFile());
		const candidate = row(
			await prepareWasmFilters([
				{
					id: "bodytrap",
					kind: "module",
					enabled: true,
					failure_mode: "open",
					config: { module_id: applications.module.id, configuration: { trap: "request" } },
				},
				application("response", { protocol: "http-json-v1" }),
			]),
		);
		await expect(prepareHost(candidate)).rejects.toThrow(/failed in request_body/);
		expect(await fs.readFile(pointerFile())).toEqual(pointer);
		expect((await request(port, { method: "POST", body: "old host" })).body.toString()).toBe("old host");
		expect(await fs.readFile(accepted.wasm.configuration_path)).toBeDefined();
	}, 20000);
	it.each([204, 304])(
		"suppresses deliberate guest response bytes for HTTP %i",
		async (status) => {
			await start([application("response", { protocol: "http-json-v1", settings: { args: [String(status)] } })]);
			const result = await request(port);
			expect(result.status).toBe(status);
			expect(result.headers["x-wasi-response"]).toBe("independent");
			expect(result.body).toHaveLength(0);
		},
		15000,
	);
	it("authenticates before executing the handler on normal and custom host locations", async () => {
		await start([
			{
				id: "auth",
				kind: "api_key",
				enabled: true,
				failure_mode: "closed",
				config: { header: "X-Api-Key", value: "secret-key" },
			},
			application("response", { protocol: "http-json-v1" }),
		]);
		for (const uri of ["/", "/custom/route"]) {
			const denied = await request(port, { uri });
			expect(denied.status).toBe(401);
			expect(denied.headers["x-wasi-response"]).toBeUndefined();
			const wrong = await request(port, { uri, headers: { "X-Api-Key": "incorrect" } });
			expect(wrong.status).toBe(401);
			const accepted = await request(port, { uri, headers: { "X-Api-Key": "secret-key" } });
			expect(accepted.status).toBe(207);
			expect(accepted.headers["x-wasi-response"]).toBe("independent");
		}
	}, 15000);
	it.each([
		["invalid JSON protocol", "stdio", "http-json-v1", "closed"],
		["guest trap", "trap", "stdio", "closed"],
		["guest deadline", "infinite", "stdio", "closed"],
		["fail-open guest trap", "trap", "stdio", "open"],
	])(
		"rejects %s before replacing an accepted host or its pointer",
		async (_name, fixture, protocol, failure) => {
			const accepted = await start([application("stdio")]);
			const [pointer, rendered, chain] = await Promise.all([
				fs.readFile(pointerFile()),
				fs.readFile(hostFile()),
				fs.readFile(accepted.wasm.configuration_path),
			]);
			const candidate = row(
				await prepareWasmFilters([application(fixture, { protocol, failure, settings: { timeout_ms: 100 } })]),
			);
			await expect(prepareHost(candidate)).rejects.toThrow(/preflight|previous configuration retained/);
			expect(await fs.readFile(pointerFile())).toEqual(pointer);
			expect(await fs.readFile(hostFile())).toEqual(rendered);
			expect(await fs.readFile(accepted.wasm.configuration_path)).toEqual(chain);
			const result = await request(port, { method: "POST", body: "accepted host remains live" });
			expect(result.status).toBe(200);
			expect(result.body.toString()).toBe("accepted host remains live");
		},
		20000,
	);
});
