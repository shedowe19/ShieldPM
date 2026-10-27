import { execFile as nodeExecFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: async () => {} } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test" }));
vi.mock("../../lib/certbot.js", () => ({ installPlugins: async () => {} }));
vi.mock("../../lib/firewall-geoip.js", async (original) => ({
	...(await original()),
	assertConfiguredFirewallLookups: async () => {},
}));

import nginx from "../../internal/nginx.js";
import utils from "../../lib/utils.js";
import ProxyHost from "../../models/proxy_host.js";
import { regenerateAllHosts } from "../../setup.js";

const binary = process.env.TRAFFIC_SMOKE_NGINX_BIN;
const suite = binary ? describe : describe.skip;
const execute = promisify(nodeExecFile);
const freePort = async () => {
	const listener = net.createServer();
	await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
	const port = listener.address().port;
	await new Promise((resolve) => listener.close(resolve));
	return port;
};
const request = (port, host) =>
	new Promise((resolve, reject) => {
		const req = http.get({ hostname: "127.0.0.1", port, agent: false, headers: { Host: host } }, (response) => {
			let body = "";
			response.setEncoding("utf8");
			response.on("data", (chunk) => (body += chunk));
			response.on("end", () => resolve({ status: response.statusCode, body }));
		});
		req.on("error", reject);
		req.setTimeout(3000, () => req.destroy(new Error("Startup fixture request timed out")));
	});

suite("startup recovers healthy hosts with actual Nginx validation and traffic", () => {
	let directory;
	let configDirectory;
	let master;
	let child;
	let origin;
	let port;
	beforeAll(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-startup-recovery-"));
		configDirectory = path.join(directory, "hosts");
		for (const location of [
			configDirectory,
			path.join(directory, "logs"),
			path.join(directory, "nginx"),
			path.join(directory, "conf.d/include"),
			path.join(directory, "custom_nginx"),
		])
			await fs.mkdir(location, { recursive: true });
		await fs.writeFile(path.join(directory, "conf.d/include/proxy-headers.conf"), "proxy_set_header Host $host;\n");
		await fs.writeFile(path.join(directory, "custom_nginx/server_proxy.conf"), "");
		port = await freePort();
		origin = http.createServer((_req, response) => response.end("origin accepted request"));
		await new Promise((resolve) => origin.listen(0, "127.0.0.1", resolve));
		vi.stubEnv("REGENERATE_ALL", "true");
		vi.stubEnv("DATA_PATH", directory);
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "false");
		vi.stubEnv("DISABLE_HTTP", "false");
		vi.stubEnv("DISABLE_IPV6", "true");
		vi.stubEnv("IPV4_BINDING", "127.0.0.1");
		vi.stubEnv("HTTP_PORT", String(port));
		vi.stubEnv("LISTEN_PROXY_PROTOCOL", "false");
		vi.stubEnv("DEMO_MODE", "false");
		vi.spyOn(nginx, "getConfigName").mockImplementation((_kind, id) => path.join(configDirectory, `${id}.conf`));
		const render = nginx.renderConfig;
		vi.spyOn(nginx, "renderConfig").mockImplementation(async (...args) =>
			(await render(...args)).replaceAll(" /data/", ` ${directory}/`),
		);
		master = path.join(directory, "nginx.conf");
		await fs.writeFile(
			master,
			`user root;pid ${directory}/pid;error_log ${directory}/error.log;events{}http{lua_package_path "${process.env.TRAFFIC_SMOKE_LUA_DIRECTORY || "/usr/local/share/lua/5.1"}/?.lua;;";access_log off;log_format json_analytics '$status';map $http_upgrade $connection_upgrade{default upgrade;"" close;}server{listen 127.0.0.1:${port} default_server;return 404;}include ${configDirectory}/*.conf;}`,
		);
		vi.spyOn(utils, "execFile").mockImplementation(async (command, args) => {
			if (command === "nginxbeautifier" && process.env.TRAFFIC_SMOKE_BEAUTIFIER_BIN) {
				const output = await execute(process.env.TRAFFIC_SMOKE_BEAUTIFIER_BIN, args);
				return `${output.stdout}${output.stderr}`;
			}
			if (command !== "nginx") throw new Error(`Unexpected fixture command: ${command}`);
			const output = await execute(binary, ["-p", directory, "-c", master, ...args]);
			return `${output.stdout}${output.stderr}`;
		});
		vi.spyOn(utils, "writeHash").mockResolvedValue();
		await execute(binary, ["-p", directory, "-c", master, "-tq"]);
		let childOutput = "";
		child = spawn(binary, ["-p", directory, "-c", master, "-g", "daemon off;"], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		child.stdout.on("data", (chunk) => {
			childOutput += chunk;
		});
		child.stderr.on("data", (chunk) => {
			childOutput += chunk;
		});
		try {
			await vi.waitFor(async () => expect((await request(port, "unknown.example.test")).status).toBe(404), {
				timeout: 3000,
			});
		} catch (error) {
			throw new Error(
				`${error.message}; child=${child.exitCode}; ${childOutput}\n${await fs.readFile(path.join(directory, "error.log"), "utf8")}`,
			);
		}
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			for (const field of [
				"forward_host",
				"forward_scheme",
				"domain_names",
				"meta",
				"modified_on",
				"advanced_config",
			])
				table.text(field);
			for (const field of ["forward_port", "certificate_id", "access_list_id", "is_deleted"])
				table.integer(field).defaultTo(0);
			table.integer("enabled").defaultTo(1);
		});
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.text("domain_name");
		});
		for (const name of ["certificate", "access_list", "redirection_host", "dead_host", "stream"])
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("is_deleted").defaultTo(0);
				table.integer("enabled").defaultTo(1);
				table.integer("certificate_id").defaultTo(0);
			});
		for (const name of ["access_list_auth", "access_list_client"])
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("access_list_id");
			});
		for (const [id, name] of [
			[7, "manual"],
			[8, "invalid"],
			[9, "docker"],
		]) {
			await state.db("proxy_host").insert({
				id,
				forward_scheme: "http",
				forward_host: "127.0.0.1",
				forward_port: origin.address().port,
				meta: JSON.stringify(
					id === 7
						? {
								upstream_pool: {
									enabled: true,
									targets: [{ id: "primary", host: "127.0.0.1", port: origin.address().port }],
								},
							}
						: id === 9
							? { docker_container_id: "fixture" }
							: {},
				),
				advanced_config:
					id === 8
						? "unknown_startup_fixture_directive on;"
						: id === 9
							? `add_header X-Literal '{"trailing":"$status}#literal"}';`
							: "",
			});
			await state.db("host_domain").insert({ proxy_host_id: id, domain_name: `${name}.example.test` });
		}
	}, 10000);
	afterEach(() => vi.clearAllMocks());
	afterAll(async () => {
		if (child?.exitCode === null) {
			const exited = new Promise((resolve) => child.once("exit", resolve));
			child.kill("SIGTERM");
			await exited;
		}
		origin?.closeAllConnections();
		if (origin?.listening) await new Promise((resolve) => origin.close(resolve));
		await state.db.destroy();
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	it("keeps a valid manual host and Docker host serving when another host is invalid, and retries the failed fingerprint", async () => {
		// Empty active directory matches start.sh deleting every *.conf on a changed fingerprint.
		await regenerateAllHosts();
		await nginx.reload(); // appStart activates the completed startup preparation once.
		await vi.waitFor(async () =>
			expect(await request(port, "manual.example.test")).toEqual({
				status: 200,
				body: "origin accepted request",
			}),
		);
		expect((await request(port, "docker.example.test")).status).toBe(200);
		const manualConfig = await fs.readFile(path.join(configDirectory, "7.conf"), "utf8");
		expect(manualConfig).toContain(`"status":$status}';`);
		expect(await fs.readFile(path.join(configDirectory, "9.conf"), "utf8")).toContain(
			`add_header X-Literal '{"trailing":"$status}#literal"}';`,
		);
		await vi.waitFor(async () => {
			const records = (await fs.readFile(path.join(directory, "logs/traffic_7.log"), "utf8"))
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			expect(records).toContainEqual(expect.objectContaining({ status: 200 }));
		});
		expect((await request(port, "invalid.example.test")).status).toBe(404);
		for (const id of [7, 9]) expect((await ProxyHost.query().findById(id)).meta.nginx_online).toBe(true);
		expect((await ProxyHost.query().findById(8)).meta).toMatchObject({
			nginx_online: false,
			nginx_err: expect.stringContaining("unknown_startup_fixture_directive"),
		});
		expect(utils.writeHash).not.toHaveBeenCalled();
		// A second startup clears active files again while the invalid host is
		// still unfixed. Healthy hosts must recover again, not accept that hash.
		for (const id of [7, 9]) await fs.unlink(path.join(configDirectory, `${id}.conf`));
		await regenerateAllHosts();
		await nginx.reload();
		await vi.waitFor(async () => expect((await request(port, "manual.example.test")).status).toBe(200));
		expect((await request(port, "docker.example.test")).status).toBe(200);
		expect(utils.writeHash).not.toHaveBeenCalled();
		await ProxyHost.query().findById(8).patch({ advanced_config: "" });
		await regenerateAllHosts();
		await nginx.reload();
		await vi.waitFor(async () => expect((await request(port, "invalid.example.test")).status).toBe(200));
		expect(utils.writeHash).toHaveBeenCalledOnce();
	});
});
