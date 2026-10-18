import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	remapSmokeListeners,
	SmokePortReservations,
	startSmokeNginx,
	stopSmokeNginx,
	withSmokeEndpointRetries,
} from "./nginx-smoke-endpoints.mjs";

// Installed-image smoke: exercise production Unix transport and packaged source,
// without touching the running service's catalog, database, keys or listeners.
const directory = await fs.mkdtemp(
	path.join(os.tmpdir(), "shieldpm-wasi-image-"),
);
process.env.DATA_PATH = directory;
process.env.NODE_ENV = "production";
delete process.env.SHIELDPM_WASM_PREFLIGHT_TCP;
Object.assign(process.env, {
	DISABLE_HTTP: "false",
	DISABLE_IPV6: "true",
	IPV4_BINDING: "127.0.0.1",
	LISTEN_PROXY_PROTOCOL: "false",
	DEMO_MODE: "false",
});
const { default: nginx } = await import("../../backend/internal/nginx.js");
const { materializeWasmHost, prepareWasmFilters } = await import(
	"../../backend/internal/wasm.js"
);
const { prepareWasiHostBridge, stopWasiHostBridges } = await import(
	"../../backend/internal/wasi-host-bridge.js"
);
const { validateWasiApplication } = await import(
	"../../backend/internal/wasi-applications.js"
);
const { writeWasmArtifact } = await import(
	"../../backend/internal/wasm-modules.js"
);
const fixtureDirectory =
	process.env.WASI_SMOKE_FIXTURES ||
	fileURLToPath(new URL("../../backend/test/fixtures/", import.meta.url));
const nginxBin = process.env.NGINX_BIN || "nginx";
const reservations = new SmokePortReservations();
let port;
let running;
let upstreamRequests = 0;
const upstream = http.createServer(async (req, res) => {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	upstreamRequests++;
	res.setHeader("Content-Type", "application/json");
	res.end(
		JSON.stringify({
			body: Buffer.concat(chunks).toString("base64"),
			headers: req.headers,
			uri: req.url,
		}),
	);
});
const request = (host, body = Buffer.alloc(0), method = "POST", headers = {}) =>
	new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: "127.0.0.1",
				port,
				path: "/echo?probe=a%26b",
				method,
				agent: false,
				headers: { Host: host, "Content-Length": body.length, ...headers },
			},
			(res) => {
				const chunks = [];
				res.on("data", (chunk) => chunks.push(chunk));
				res.on("error", reject);
				res.on("end", () =>
					resolve({
						status: res.statusCode,
						headers: res.headers,
						body: Buffer.concat(chunks),
					}),
				);
			},
		);
		req.setTimeout(10000, () =>
			req.destroy(new Error("WASI image HTTP request timed out")),
		);
		req.on("error", reject);
		req.end(body);
	});
async function catalog(filename) {
	const bytes = await fs.readFile(path.join(fixtureDirectory, filename));
	await validateWasiApplication(bytes);
	const id = createHash("sha256").update(bytes).digest("hex");
	await writeWasmArtifact(
		path.join(directory, "wasm/artifacts", `${id}.wasm`),
		bytes,
	);
	await writeWasmArtifact(
		path.join(directory, "wasm/applications", `${id}.json`),
		JSON.stringify({
			id,
			sha256: id,
			name: `Image smoke ${filename}`,
			filename,
			size: bytes.length,
			runtime: "wasi-preview1",
			created_on: new Date().toISOString(),
		}),
	);
	return id;
}
try {
	await new Promise((resolve, reject) => {
		upstream.once("error", reject);
		upstream.listen(0, "127.0.0.1", resolve);
	});
	port = await reservations.reserve();
	process.env.HTTP_PORT = String(port);
	const stdio = await catalog("standalone-wasi-http-stdio.wasm");
	const rewrite = await catalog("standalone-wasi-http-filter.wasm");
	const responder = await catalog("standalone-wasi-http-response.wasm");
	const trap = await catalog("standalone-wasi-trap.wasm");
	const cases = [
		{
			name: "stdio",
			application: stdio,
			protocol: "stdio",
			mode: "handler",
			settings: {},
		},
		{
			name: "metadata",
			application: stdio,
			protocol: "stdio",
			mode: "handler",
			settings: {
				args: ["metadata-proof"],
				env: [{ name: "SMOKE_VALUE", value: "explicit" }],
			},
		},
		{
			name: "filter",
			application: rewrite,
			protocol: "http-json-v1",
			mode: "filter",
			settings: {},
		},
		{
			name: "response",
			application: responder,
			protocol: "http-json-v1",
			mode: "handler",
			settings: {},
		},
		{
			name: "empty",
			application: responder,
			protocol: "http-json-v1",
			mode: "handler",
			settings: { args: ["204"] },
		},
		{
			name: "unmodified",
			application: responder,
			protocol: "http-json-v1",
			mode: "handler",
			settings: { args: ["304"] },
		},
		{
			name: "trap",
			application: trap,
			protocol: "stdio",
			mode: "handler",
			settings: {},
		},
	];
	const servers = [];
	for (const [index, item] of cases.entries()) {
		const filters = await prepareWasmFilters([
			{
				id: "application",
				kind: "application",
				enabled: true,
				failure_mode: "closed",
				config: {
					application_id: item.application,
					mode: item.mode,
					protocol: item.protocol,
					settings: item.settings,
				},
			},
		]);
		const host = {
			id: 75000 + index,
			enabled: true,
			domain_names: [`${item.name}.wasi-smoke.test`],
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: upstream.address().port,
			certificate_id: 0,
			access_list_id: 0,
			meta: { wasm_filters: filters },
		};
		host.wasm = await materializeWasmHost(host);
		const rendered = await nginx.renderConfig("proxy_host", host);
		// Only unrelated external includes and optional presentation modules are removed.
		// The production Wasm access/header/body hooks remain intact.
		servers.push(
			rendered
				.replace(/^\s*include [^;]+;/gm, "")
				.replace(/^\s*(?:zstd(?:_static)?|fancyindex)\s+[^;]+;/gm, ""),
		);
	}
	const bridge = await prepareWasiHostBridge();
	assert(
		!bridge.socket_path.startsWith("tcp:"),
		"Image smoke must use production Unix transport",
	);
	const socket = await fs.lstat(bridge.socket_path);
	assert(socket.isSocket());
	assert.equal(socket.uid, process.getuid());
	assert.equal(socket.mode & 0o777, 0o600);
	const config = path.join(directory, "nginx.conf");
	const luaPath =
		process.env.SHIELDPM_WASM_LUA_PATH ||
		"/usr/local/share/lua/5.1/?.lua;/usr/local/share/lua/5.1/?/init.lua;;";
	let configuration = `
${process.getuid() === 0 ? "user root;" : ""}
master_process off;
pid ${directory}/nginx.pid;
error_log ${directory}/error.log warn;
events { worker_connections 64; }
http {
    access_log off;
    lua_package_path ${JSON.stringify(luaPath)};
    ${process.env.SHIELDPM_WASM_LUA_CPATH ? `lua_package_cpath ${JSON.stringify(process.env.SHIELDPM_WASM_LUA_CPATH)};` : ""}
    map $http_upgrade $connection_upgrade {default upgrade; '' close;}
    ${["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map((name) => `${name}_temp_path ${directory}/${name};`).join("\n")}
    server {listen 127.0.0.1:${port} default_server; http2 on; return 404;}
    ${servers.join("\n")}
}
`;
	await fs.writeFile(config, configuration);
	execFileSync(
		nginxBin,
		["-e", "stderr", "-tq", "-c", config, "-p", `${directory}/`],
		{ stdio: "inherit" },
	);
	running = await withSmokeEndpointRetries({
		reservations,
		remap: async (replacements) => {
			port = replacements.get(`tcp:${port}`);
			configuration = remapSmokeListeners(configuration, replacements);
			await fs.writeFile(config, configuration);
			execFileSync(
				nginxBin,
				["-e", "stderr", "-tq", "-c", config, "-p", `${directory}/`],
				{ stdio: "inherit" },
			);
		},
		run: () =>
			startSmokeNginx({ nginxBin, config, directory, internalPort: port }),
	});
	const raw = Buffer.from([0, 255, 128, 65, 10]);
	const echo = await request("stdio.wasi-smoke.test", raw);
	assert.equal(echo.status, 200);
	// stdio is the documented UTF-8 output protocol; invalid bytes normalize once.
	assert.deepEqual(echo.body, Buffer.from(raw.toString("utf8")));
	assert.match(echo.headers["content-type"], /^text\/plain/);
	const metadata = await request(
		"metadata.wasi-smoke.test",
		Buffer.from("input-proof"),
	);
	assert.equal(metadata.status, 200);
	const text = metadata.body.toString();
	for (const line of [
		"application.wasm",
		"metadata-proof",
		"SMOKE_VALUE=explicit",
		"SHIELDPM_HTTP_METHOD=POST",
		"SHIELDPM_HTTP_URI=/echo?probe=a%26b",
		"SHIELDPM_HTTP_QUERY=probe=a%26b",
		"input-proof",
	])
		assert(text.includes(line), line);
	assert(
		!text.includes("PATH="),
		"Runner must not inherit the image environment",
	);
	const filtered = await request(
		"filter.wasi-smoke.test",
		Buffer.from("original"),
		"POST",
		{ "X-Remove-Me": "remove" },
	);
	assert.equal(filtered.status, 200);
	const forwarded = JSON.parse(filtered.body);
	assert.deepEqual(
		Buffer.from(forwarded.body, "base64"),
		Buffer.from("rewritten\0binary"),
	);
	assert.equal(forwarded.headers["x-wasi-filter"], "trusted");
	assert.equal(forwarded.headers["x-remove-me"], undefined);
	assert.equal(forwarded.uri, "/echo?probe=a%26b");
	const response = await request("response.wasi-smoke.test");
	assert.equal(response.status, 207);
	assert.equal(response.headers["x-wasi-response"], "independent");
	assert.deepEqual(response.body, raw);
	for (const [name, status] of [
		["empty", 204],
		["unmodified", 304],
	]) {
		const result = await request(`${name}.wasi-smoke.test`);
		assert.equal(result.status, status);
		assert.equal(result.body.length, 0);
	}
	const failure = await request("trap.wasi-smoke.test");
	assert.equal(failure.status, 503);
	assert.equal(
		upstreamRequests,
		1,
		"Handlers and failed guests must never fall through to the origin",
	);
	console.log(
		`WASI host image smoke passed: production Unix bridge, UID ${process.getuid()}, 7 generated hosts; stdio, metadata, binary JSON response, 204/304, upstream filter and fail-closed trap`,
	);
} catch (error) {
	console.error(
		await fs
			.readFile(path.join(directory, "error.log"), "utf8")
			.catch(() => ""),
	);
	throw error;
} finally {
	if (running) await stopSmokeNginx(running);
	await reservations.release();
	await stopWasiHostBridges();
	upstream.closeAllConnections();
	await new Promise((resolve) => upstream.close(resolve));
	await fs.rm(directory, { recursive: true, force: true });
}
