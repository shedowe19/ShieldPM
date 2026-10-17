import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/anubis.js", () => ({ default: {} }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test" }));
vi.mock("../../lib/encryption.js", () => ({
	encrypt: (value) => `sealed:${value}`,
	decrypt: (value) => value.slice(7),
}));

import nginx from "../../internal/nginx.js";
import { getHostStatus, prepareHost, prepareWasmFilters } from "../../internal/wasm.js";
import {
	afterWasmReload,
	beforeWasmReload,
	collectRetiredWasmConfigurations,
	createWasmLifecycle,
	finishWasmLifecycle,
	nginxWorkerSnapshot,
} from "../../internal/wasm-lifecycle.js";
import utils from "../../lib/utils.js";

const binary = process.env.SHIELDPM_WASM_NGINX_BINARY;
const suite = binary ? describe : describe.skip;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitFor = async (condition, description, timeout = 5000) => {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await condition()) return;
		await sleep(25);
	}
	throw new Error(`Timed out waiting for ${description}`);
};
const listen = async (server) => {
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return server.address().port;
};
const request = (port, key, uri = "/") =>
	new Promise((resolve, reject) => {
		const req = http.get(
			{
				host: "127.0.0.1",
				port,
				path: uri,
				agent: false,
				headers: { Host: "wasm-lifecycle.example.test", ...(key ? { "x-api-key": key } : {}) },
				timeout: 10000,
			},
			(response) => {
				let body = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					body += chunk;
				});
				response.on("end", () => resolve({ status: response.statusCode, body }));
			},
		);
		req.on("error", reject);
		req.on("timeout", () => req.destroy(new Error("Lifecycle request timed out")));
	});
const exists = (filename) =>
	fs.access(filename).then(
		() => true,
		(error) => {
			if (error.code === "ENOENT") return false;
			throw error;
		},
	);

suite("real Nginx worker generation and Wasm secret retirement", () => {
	let directory;
	let data;
	let proxyDirectory;
	let hostFile;
	let port;
	let origin;
	let originPort;
	let child;
	const held = new Map();
	const prepareProcView = async () => {
		const localPid = (await fs.readFile(path.join(directory, "pid"), "utf8")).trim();
		const nativeTitle = await fs.readFile(`/proc/${localPid}/cmdline`, "utf8").catch(() => "");
		if (nativeTitle.startsWith("nginx: master process") && nativeTitle.includes(directory)) return;
		// Some isolated runners mount host /proc beside a nested PID namespace. Translate
		// only the observation PID file; every process title, identity and parent is real.
		const entries = await fs.readdir("/proc");
		let globalPid;
		for (const entry of entries.filter((name) => /^[1-9]\d*$/.test(name))) {
			const title = await fs.readFile(`/proc/${entry}/cmdline`, "utf8").catch(() => "");
			if (title.startsWith("nginx: master process") && title.includes(directory)) {
				globalPid = entry;
				break;
			}
		}
		if (!globalPid) throw new Error("Cannot locate actual Nginx master in mounted /proc");
		const observedPidFile = path.join(directory, "observed-master.pid");
		await fs.writeFile(observedPidFile, globalPid);
		vi.stubEnv("SHIELDPM_WASM_NGINX_PIDFILE", observedPidFile);
	};
	const row = (filters = []) => ({
		id: 77,
		enabled: true,
		domain_names: ["wasm-lifecycle.example.test"],
		forward_scheme: "http",
		forward_host: "127.0.0.1",
		forward_port: originPort,
		certificate_id: 0,
		access_list_id: 0,
		advanced_config: "",
		locations: [],
		meta: { wasm_filters: filters },
	});
	const pointer = async () => JSON.parse(await fs.readFile(path.join(data, "wasm/active/host-77.json"), "utf8"));
	const policy = async (key) => {
		const host = row(
			await prepareWasmFilters([
				{
					id: "auth",
					kind: "api_key",
					enabled: true,
					failure_mode: "closed",
					config: { header: "x-api-key", value: key },
				},
			]),
		);
		host.wasm = await prepareHost(host);
		return host;
	};
	const writeHost = async (host) => {
		const rendered = (await nginx.renderConfig("proxy_host", host)).replaceAll(" /data/", ` ${data}/`);
		if (host.wasm)
			expect(rendered).toContain(`# ShieldPM Wasm configuration: ${path.basename(host.wasm.configuration_path)}`);
		await fs.writeFile(hostFile, rendered);
	};
	const reload = async (context) => {
		const before = await beforeWasmReload(context);
		expect(before?.known).toBe(true);
		expect(child.kill("SIGHUP")).toBe(true);
		await afterWasmReload(context, before);
		return before;
	};
	const activate = async (key) => {
		const context = await createWasmLifecycle();
		const host = await policy(key);
		await writeHost(host);
		await reload(context);
		await finishWasmLifecycle(context);
		expect(await pointer()).toMatchObject({
			state: "active",
			configuration_file: path.basename(host.wasm.configuration_path),
		});
		expect((await request(port, key)).status).toBe(200);
		return host;
	};
	const slowRequest = async (key, name) => {
		const pending = request(port, key, `/slow/${name}`);
		// Keep a failed assertion from leaving a rejected network promise during cleanup.
		void pending.catch(() => {});
		await waitFor(() => held.has(name), `upstream request ${name}`);
		return {
			pending,
			release: () => {
				const entry = held.get(name);
				entry.response.end(`origin:${entry.key}`);
				held.delete(name);
			},
		};
	};
	const retire = async (filename) =>
		waitFor(async () => {
			await collectRetiredWasmConfigurations();
			return !(await exists(filename));
		}, "retired policy file removal").catch(async (error) => {
			throw new Error(
				`${error.message}: ${JSON.stringify({ file: path.basename(filename), retirement: JSON.parse(await fs.readFile(path.join(data, "wasm/retirement.json"), "utf8")), pointer: await pointer(), snapshot: await nginxWorkerSnapshot(), markers: (await fs.readFile(hostFile, "utf8")).split("\n").filter((line) => line.includes("ShieldPM Wasm configuration:")) })}`,
			);
		});
	beforeAll(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-lifecycle-runtime-"));
		data = path.join(directory, "data");
		proxyDirectory = path.join(data, "nginx/proxy_host");
		hostFile = path.join(proxyDirectory, "77.conf");
		for (const target of [
			proxyDirectory,
			path.join(data, "logs"),
			path.join(data, "custom_nginx"),
			path.join(directory, "logs"),
			path.join(directory, "conf.d/include"),
		])
			await fs.mkdir(target, { recursive: true });
		await fs.writeFile(path.join(data, "custom_nginx/server_proxy.conf"), "");
		await fs.writeFile(
			path.join(directory, "conf.d/include/proxy-headers.conf"),
			"proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade;\n",
		);
		origin = http.createServer((req, res) => {
			const key = req.headers["x-api-key"] || "public";
			if (req.url.startsWith("/slow/")) held.set(req.url.slice(6), { response: res, key });
			else res.end(`origin:${key}`);
		});
		originPort = await listen(origin);
		const reserve = net.createServer();
		port = await listen(reserve);
		await new Promise((resolve) => reserve.close(resolve));
		vi.stubEnv("DATA_PATH", data);
		vi.stubEnv("SHIELDPM_WASM_NGINX_PIDFILE", path.join(directory, "pid"));
		vi.stubEnv("SHIELDPM_WASM_PROXY_HOST_DIRECTORY", proxyDirectory);
		vi.stubEnv("SHIELDPM_NGINX_CONF", path.join(directory, "nginx.conf"));
		vi.stubEnv("DISABLE_HTTP", "false");
		vi.stubEnv("DISABLE_IPV6", "true");
		vi.stubEnv("IPV4_BINDING", "127.0.0.1");
		vi.stubEnv("HTTP_PORT", String(port));
		vi.stubEnv("LISTEN_PROXY_PROTOCOL", "false");
		vi.stubEnv("DEMO_MODE", "false");
		vi.stubEnv("ACME_OCSP_STAPLING", "false");
		vi.stubEnv("CUSTOM_OCSP_STAPLING", "false");
		const luaPath =
			process.env.SHIELDPM_WASM_LUA_PATH ||
			"/usr/local/share/lua/5.1/?.lua;/usr/local/share/lua/5.1/?/init.lua;;";
		const cpath = process.env.SHIELDPM_WASM_LUA_CPATH
			? `lua_package_cpath ${JSON.stringify(process.env.SHIELDPM_WASM_LUA_CPATH)};`
			: "";
		await fs.writeFile(
			path.join(directory, "nginx.conf"),
			`user root; daemon off; master_process on; worker_processes 1; pid ${directory}/pid; error_log ${directory}/error.log warn;
events { worker_connections 128; } http {
wasm_vm wasmtime; lua_package_path ${JSON.stringify(luaPath)}; ${cpath}
access_log off; log_format json_analytics '$status'; map $http_upgrade $connection_upgrade {default upgrade;'' close;}
client_body_temp_path ${directory}/body; proxy_temp_path ${directory}/proxy;
server {listen 127.0.0.1:${port} default_server; server_name _; return 404;}
include ${proxyDirectory}/*.conf; }`,
		);
		await writeHost(row());
		execFileSync(binary, ["-p", `${directory}/`, "-c", path.join(directory, "nginx.conf"), "-tq"], {
			stdio: "pipe",
		});
		child = spawn(binary, ["-p", `${directory}/`, "-c", path.join(directory, "nginx.conf")], { stdio: "ignore" });
		await waitFor(async () => {
			try {
				return (await request(port)).status === 200;
			} catch {
				if (child.exitCode !== null)
					throw new Error(await fs.readFile(path.join(directory, "error.log"), "utf8"));
				return false;
			}
		}, "one live Nginx worker").catch(async (error) => {
			const read = (filename) => fs.readFile(filename, "utf8").catch((failure) => failure.message);
			const pid = (await read(path.join(directory, "pid"))).trim();
			throw new Error(
				`${error.message}; ${JSON.stringify({ response: await request(port).catch((failure) => failure.message), snapshot: await nginxWorkerSnapshot(), pid, title: await read(`/proc/${pid}/cmdline`), stat: await read(`/proc/${pid}/stat`), children: await read(`/proc/${pid}/task/${pid}/children`), errorLog: await read(path.join(directory, "error.log")) })}`,
			);
		});
		await prepareProcView();
		await waitFor(async () => (await nginxWorkerSnapshot()).known, "real kernel worker observation");
		expect((await nginxWorkerSnapshot()).workers.filter((worker) => !worker.stopping)).toHaveLength(1);
	}, 15000);
	afterEach(() => {
		for (const entry of held.values()) entry.response.end("cleanup");
		held.clear();
	});
	afterAll(async () => {
		for (const entry of held.values()) entry.response.end("cleanup");
		held.clear();
		if (child?.exitCode === null) {
			const ended = new Promise((resolve) => child.once("close", resolve));
			child.kill("SIGTERM");
			await ended;
		}
		origin?.closeAllConnections?.();
		if (origin?.listening) await new Promise((resolve) => origin.close(resolve));
		vi.unstubAllEnvs();
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	it("keeps the old key file while its worker drains and acknowledges the new key generation", async () => {
		const old = await activate("old-key");
		const slow = await slowRequest("old-key", "rotate");
		const context = await createWasmLifecycle();
		const next = await policy("rotated-key");
		expect(await pointer()).toMatchObject({
			state: "active",
			configuration_file: path.basename(old.wasm.configuration_path),
		});
		await writeHost(next);
		const previous = await reload(context);
		expect(await pointer()).toMatchObject({ configuration_file: path.basename(old.wasm.configuration_path) });
		expect(await finishWasmLifecycle(context)).toBe(true);
		expect(await pointer()).toMatchObject({
			state: "active",
			configuration_file: path.basename(next.wasm.configuration_path),
		});
		const snapshot = await nginxWorkerSnapshot();
		expect(
			snapshot.workers.some(
				(worker) => worker.stopping && previous.workers.some((prior) => prior.token === worker.token),
			),
		).toBe(true);
		expect(await collectRetiredWasmConfigurations()).toBe(true);
		expect(await exists(old.wasm.configuration_path)).toBe(true);
		expect((await request(port, "old-key")).status).toBe(401);
		expect((await request(port, "rotated-key")).status).toBe(200);
		slow.release();
		expect(await slow.pending).toMatchObject({ status: 200, body: "origin:old-key" });
		await retire(old.wasm.configuration_path);
		expect(await exists(next.wasm.configuration_path)).toBe(true);
		expect(await collectRetiredWasmConfigurations()).toBe(false);
	}, 15000);
	it("marks removed filters and deleted hosts inactive only after accepted reloads, then erases their keys", async () => {
		const current = await activate("removed-key");
		const previousFile = current.wasm.configuration_path;
		const slow = await slowRequest("removed-key", "remove");
		const context = await createWasmLifecycle();
		await writeHost(row());
		await reload(context);
		expect(await pointer()).toMatchObject({ state: "active" });
		await finishWasmLifecycle(context);
		expect(await getHostStatus(77)).toMatchObject({ state: "inactive" });
		expect(await exists(previousFile)).toBe(true);
		expect((await request(port)).status).toBe(200);
		slow.release();
		await slow.pending;
		await retire(previousFile);
		const deleted = await activate("deleted-key");
		const deleting = await slowRequest("deleted-key", "delete");
		const deletion = await createWasmLifecycle();
		await fs.unlink(hostFile);
		await reload(deletion);
		await finishWasmLifecycle(deletion);
		expect(await getHostStatus(77)).toMatchObject({ state: "inactive" });
		expect((await request(port, "deleted-key")).status).toBe(404);
		expect(await exists(deleted.wasm.configuration_path)).toBe(true);
		deleting.release();
		await deleting.pending;
		await retire(deleted.wasm.configuration_path);
	}, 15000);
	it("restores the accepted pointer after rolling back a candidate generation and retires its draining key", async () => {
		const stable = await activate("stable-key");
		const restoredText = await fs.readFile(hostFile, "utf8");
		const context = await createWasmLifecycle();
		const candidate = await policy("candidate-key");
		await writeHost(candidate);
		await reload(context);
		const slow = await slowRequest("candidate-key", "rollback");
		expect(await pointer()).toMatchObject({ configuration_file: path.basename(stable.wasm.configuration_path) });
		await fs.writeFile(hostFile, restoredText);
		await reload(context);
		await finishWasmLifecycle(context);
		expect(await pointer()).toMatchObject({
			state: "active",
			configuration_file: path.basename(stable.wasm.configuration_path),
		});
		expect((await request(port, "stable-key")).status).toBe(200);
		expect((await request(port, "candidate-key")).status).toBe(401);
		expect(await exists(candidate.wasm.configuration_path)).toBe(true);
		slow.release();
		expect(await slow.pending).toMatchObject({ status: 200, body: "origin:candidate-key" });
		await retire(candidate.wasm.configuration_path);
		expect(await exists(stable.wasm.configuration_path)).toBe(true);
	}, 15000);
	it("does not accept a rejected reload signal and removes its candidate after successful rollback", async () => {
		await activate("rejection-stable-key");
		const stable = await pointer();
		const restoredText = await fs.readFile(hostFile, "utf8");
		const context = await createWasmLifecycle();
		const candidate = await policy("rejected-key");
		await writeHost(candidate);
		await fs.appendFile(hostFile, "\ninvalid_lifecycle_directive;\n");
		const before = await beforeWasmReload(context);
		vi.stubEnv("SHIELDPM_WASM_ACK_TIMEOUT_MS", "600");
		child.kill("SIGHUP");
		await expect(afterWasmReload(context, before)).rejects.toThrow("not acknowledged");
		expect(await pointer()).toMatchObject({ state: "active", configuration_file: stable.configuration_file });
		expect((await request(port, "rejection-stable-key")).status).toBe(200);
		await fs.writeFile(hostFile, restoredText);
		await reload(context);
		await finishWasmLifecycle(context);
		await retire(candidate.wasm.configuration_path);
		expect(await pointer()).toMatchObject({ state: "active", configuration_file: stable.configuration_file });
		expect((await request(port, "rejected-key")).status).toBe(401);
	}, 15000);
	it("defers central activation until its lock finishes and publishes the compensated rollback", async () => {
		await activate("central-initial-key");
		const originalExec = utils.execFile;
		const testSpy = vi.spyOn(nginx, "test").mockImplementation(async () =>
			execFileSync(binary, ["-p", `${directory}/`, "-c", path.join(directory, "nginx.conf"), "-tq"], {
				stdio: "pipe",
			}).toString(),
		);
		const execSpy = vi.spyOn(utils, "execFile").mockImplementation(async (command, args, options) => {
			if (command === "nginx" && args.join(" ") === "-s reload") {
				expect(child.kill("SIGHUP")).toBe(true);
				return "";
			}
			return originalExec(command, args, options);
		});
		try {
			const initial = await pointer();
			let accepted;
			await nginx.withConfigurationLock(async () => {
				accepted = await policy("central-key");
				await writeHost(accepted);
				await nginx.reload();
				expect(await pointer()).toMatchObject({ configuration_file: initial.configuration_file });
			});
			expect(await pointer()).toMatchObject({
				state: "active",
				configuration_file: path.basename(accepted.wasm.configuration_path),
			});
			const restoredText = await fs.readFile(hostFile, "utf8");
			let candidate;
			let slow;
			await expect(
				nginx.withConfigurationLock(async () => {
					candidate = await policy("central-candidate-key");
					await writeHost(candidate);
					await nginx.reload();
					expect(await pointer()).toMatchObject({
						configuration_file: path.basename(accepted.wasm.configuration_path),
					});
					slow = await slowRequest("central-candidate-key", "central-rollback");
					try {
						throw new Error("simulated status persistence failure");
					} catch (error) {
						await fs.writeFile(hostFile, restoredText);
						await nginx.reload();
						throw error;
					}
				}),
			).rejects.toThrow("simulated status persistence failure");
			expect(await pointer()).toMatchObject({
				state: "active",
				configuration_file: path.basename(accepted.wasm.configuration_path),
			});
			expect((await request(port, "central-key")).status).toBe(200);
			expect((await request(port, "central-candidate-key")).status).toBe(401);
			expect(await exists(candidate.wasm.configuration_path)).toBe(true);
			slow.release();
			expect(await slow.pending).toMatchObject({ status: 200, body: "origin:central-candidate-key" });
			await retire(candidate.wasm.configuration_path);
			expect(testSpy).toHaveBeenCalledTimes(3);
			expect(
				execSpy.mock.calls.filter(([command, args]) => command === "nginx" && args.join(" ") === "-s reload"),
			).toHaveLength(3);
			// Allow the production's unref retirement tick to finish while its real master exists.
			await sleep(1100);
		} finally {
			testSpy.mockRestore();
			execSpy.mockRestore();
		}
	}, 15000);
});
