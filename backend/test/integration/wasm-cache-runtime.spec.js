import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: {} }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test" }));
vi.mock("../../lib/encryption.js", () => ({
	encrypt: (value) => `sealed:${value}`,
	decrypt: (value) => value.slice(7),
}));

import { prepareTrafficFiles } from "../../internal/host-traffic-policy.js";
import nginx from "../../internal/nginx.js";
import { prepareHost, prepareWasmFilters } from "../../internal/wasm.js";

const binary = process.env.SHIELDPM_WASM_NGINX_BINARY;
const suite = binary ? describe : describe.skip;
const request = (port, uri = "/asset.css", headers = {}) =>
	new Promise((resolve, reject) => {
		const req = http.get(
			{
				host: "127.0.0.1",
				port,
				path: uri,
				headers: { Host: "wasm-cache.example.test", ...headers },
				timeout: 3000,
			},
			(res) => {
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (part) => {
					body += part;
				});
				res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
			},
		);
		req.on("error", reject);
		req.on("timeout", () => req.destroy(new Error("runtime timeout")));
	});
const listen = async (server) => {
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return server.address().port;
};
const close = async (server) => {
	server.closeAllConnections?.();
	if (server.listening) await new Promise((resolve) => server.close(resolve));
};
suite("real ShieldPM Wasm and cache activation", () => {
	let directory;
	let data;
	let port;
	let origin;
	let originPort;
	let child;
	let row;
	let hits = 0;
	const stop = async () => {
		if (child && child.exitCode === null) {
			const ended = new Promise((resolve) => child.once("close", resolve));
			child.kill("SIGTERM");
			await ended;
		}
	};
	const start = async () => {
		await prepareTrafficFiles(row);
		let rendered = await nginx.renderConfig("proxy_host", row);
		rendered = rendered.replaceAll(" /data/", ` ${data}/`);
		await fs.writeFile(path.join(directory, "host.conf"), rendered);
		const luaPath =
			process.env.SHIELDPM_WASM_LUA_PATH ||
			"/usr/local/share/lua/5.1/?.lua;/usr/local/share/lua/5.1/?/init.lua;;";
		const cpath = process.env.SHIELDPM_WASM_LUA_CPATH
			? `lua_package_cpath ${JSON.stringify(process.env.SHIELDPM_WASM_LUA_CPATH)};`
			: "";
		await fs.writeFile(
			path.join(directory, "nginx.conf"),
			`user root; pid ${directory}/pid; error_log ${directory}/error.log warn; events {} http {
   wasm_vm wasmtime; lua_package_path ${JSON.stringify(luaPath)}; ${cpath}
   access_log off; log_format json_analytics '$status'; map $http_upgrade $connection_upgrade { default upgrade; '' close; }
   client_body_temp_path ${directory}/body; proxy_temp_path ${directory}/proxy; include ${directory}/host.conf;
  }`,
		);
		execFileSync(binary, ["-p", `${directory}/`, "-c", path.join(directory, "nginx.conf"), "-tq"], {
			stdio: "pipe",
		});
		child = spawn(
			binary,
			["-p", `${directory}/`, "-c", path.join(directory, "nginx.conf"), "-g", "daemon off; master_process off;"],
			{ stdio: "ignore" },
		);
		for (let i = 0; i < 60; i++) {
			try {
				await request(port, "/ready");
				return;
			} catch {
				if (child.exitCode !== null)
					throw new Error(await fs.readFile(path.join(directory, "error.log"), "utf8"));
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		}
		throw new Error("Nginx never became ready");
	};
	beforeAll(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-cache-runtime-"));
		data = path.join(directory, "data");
		for (const target of ["logs", "custom_nginx", "nginx"])
			await fs.mkdir(path.join(data, target), { recursive: true });
		await fs.mkdir(path.join(directory, "logs"));
		await fs.writeFile(path.join(data, "custom_nginx/server_proxy.conf"), "");
		await fs.cp(
			process.env.TRAFFIC_SMOKE_INCLUDE_DIRECTORY ||
				"/workspace/scratch/11147cbfe000/nginx-benchmark-fixture/conf.d",
			path.join(directory, "conf.d"),
			{ recursive: true },
		);
		origin = http.createServer((req, res) => {
			hits++;
			res.end(`origin:${hits}:${req.headers["x-policy"] || "none"}`);
		});
		originPort = await listen(origin);
		const reserve = net.createServer();
		port = await listen(reserve);
		await close(reserve);
		vi.stubEnv("DATA_PATH", data);
		vi.stubEnv("SHIELDPM_NGINX_CONF", path.join(directory, "nginx.conf"));
		vi.stubEnv("DISABLE_HTTP", "false");
		vi.stubEnv("DISABLE_IPV6", "true");
		vi.stubEnv("IPV4_BINDING", "127.0.0.1");
		vi.stubEnv("HTTP_PORT", String(port));
		vi.stubEnv("LISTEN_PROXY_PROTOCOL", "false");
		vi.stubEnv("DEMO_MODE", "false");
		row = {
			id: 77,
			enabled: true,
			domain_names: ["wasm-cache.example.test"],
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: originPort,
			certificate_id: 0,
			access_list_id: 0,
			advanced_config: "",
			locations: [
				{ path: "/custom", forward_scheme: "http", forward_host: "127.0.0.1", forward_port: originPort },
			],
			meta: { cache_policy: { enabled: true, assets_only: false, routes: [{ path: "/", ttl_seconds: 60 }] } },
		};
		await start();
	}, 15000);
	afterAll(async () => {
		await stop();
		if (origin) await close(origin);
		vi.unstubAllEnvs();
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	it("warms public cache then activates API-key policy without leaking a cached response", async () => {
		const first = await request(port);
		const cached = await request(port);
		expect(first.headers["x-shieldpm-cache"]).toBe("MISS");
		expect(cached.headers["x-shieldpm-cache"]).toBe("HIT");
		expect(cached.body).toBe(first.body);
		await stop();
		row.meta.wasm_filters = await prepareWasmFilters([
			{
				id: "auth",
				kind: "api_key",
				enabled: true,
				failure_mode: "closed",
				config: { header: "x-api-key", value: "private-key" },
			},
			{
				id: "transform",
				kind: "request_header",
				enabled: true,
				failure_mode: "closed",
				config: { header: "x-policy", operation: "set", value: "trusted" },
			},
			{
				id: "response",
				kind: "response_header",
				enabled: true,
				failure_mode: "closed",
				config: { header: "x-wasm-policy", operation: "set", value: "active" },
			},
		]);
		row.wasm = await prepareHost(row);
		await start();
		const beforeDenied = hits;
		expect((await request(port)).status).toBe(401);
		expect((await request(port, "/asset.css", { "x-api-key": "wrong" })).status).toBe(401);
		expect(hits).toBe(beforeDenied);
		const allowed = await request(port, "/asset.css", { "x-api-key": "private-key", "x-policy": "spoofed" });
		const repeated = await request(port, "/asset.css", { "x-api-key": "private-key" });
		expect(allowed.status).toBe(200);
		expect(allowed.headers["x-shieldpm-cache"]).toBe("BYPASS");
		expect(repeated.headers["x-shieldpm-cache"]).toBe("BYPASS");
		expect(allowed.body).toMatch(/:trusted$/);
		expect(repeated.body).not.toBe(allowed.body);
		expect(allowed.headers["x-wasm-policy"]).toBe("active");
		expect((await request(port, "/custom")).status).toBe(401);
		expect((await request(port, "/custom", { "x-api-key": "private-key" })).status).toBe(200);
	}, 15000);
	it("renders public Anubis hooks once and keeps previews read-only", async () => {
		const anubis = await nginx.renderConfig("proxy_host", { ...row, anubis_enabled: true });
		expect(anubis.match(/wasm_dispatcher.access\(/g) || []).toHaveLength(1);
		expect(anubis.match(/header_filter_by_lua_block/g) || []).toHaveLength(1);
		const before = await fs.readdir(path.join(data, "wasm/hosts"));
		const preview = await nginx.renderConfig("proxy_host", { ...row, wasm: undefined }, { preview: true });
		expect(preview).toContain("[DRAFT].json");
		expect(await fs.readdir(path.join(data, "wasm/hosts"))).toEqual(before);
		expect(preview).not.toContain("private-key");
		expect(preview).toContain("Preview policy:");
		expect(preview).toContain('"value":"trusted"');
	});
});
