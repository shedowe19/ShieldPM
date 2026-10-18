import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Model } from "objection";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ database: null, engine: "sqlite" }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => state.engine === "sqlite",
	isPostgres: () => state.engine === "postgres",
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "benchmark-token" }));

import nginx from "../../internal/nginx.js";
import utils from "../../lib/utils.js";
import ProxyHost from "../../models/proxy_host.js";

const enabled = process.env.SHIELDPM_NGINX_BENCHMARK === "true";
const sizes = (process.env.SHIELDPM_NGINX_BENCHMARK_SIZES || "10,100,1000").split(",").map(Number);
const rounds = Number(process.env.SHIELDPM_NGINX_BENCHMARK_ROUNDS || 3);
const graph = "[host_domains,certificate,access_list.[clients,items]]";
const baselineRefresh = (model, _hostType, id) => model.query().findById(id).withGraphFetched(graph);

async function prepareDatabase(database) {
	await database.schema.createTable("proxy_host", (table) => {
		table.increments("id");
		for (const field of ["forward_host", "forward_scheme", "domain_names", "meta", "modified_on"])
			table.text(field);
		for (const field of ["forward_port", "certificate_id", "access_list_id", "is_deleted"])
			table.integer(field).defaultTo(0);
		table.integer("enabled").defaultTo(1);
	});
	await database.schema.createTable("host_domain", (table) => {
		table.increments("id");
		table.integer("proxy_host_id");
		table.text("domain_name");
	});
	for (const tableName of ["certificate", "access_list"])
		await database.schema.createTable(tableName, (table) => {
			table.increments("id");
			table.integer("is_deleted").defaultTo(0);
			table.text("meta");
			table.text("provider");
		});
	for (const tableName of ["access_list_auth", "access_list_client"])
		await database.schema.createTable(tableName, (table) => {
			table.increments("id");
			table.integer("access_list_id");
			for (const field of ["username", "address", "directive"]) table.text(field);
		});
	await database("certificate").insert({ id: 1, provider: "custom", meta: "{}" });
	await database("access_list").insert({ id: 1, meta: "{}" });
	await database("access_list_auth").insert([
		{ access_list_id: 1, username: "first" },
		{ access_list_id: 1, username: "second" },
	]);
	await database("access_list_client").insert([
		{ access_list_id: 1, directive: "allow", address: "192.0.2.0/24" },
		{ access_list_id: 1, directive: "allow", address: "2001:db8::/32" },
	]);
	for (let id = 1; id <= Math.max(...sizes); id++) {
		await database("proxy_host").insert({
			id,
			forward_host: "127.0.0.1",
			forward_scheme: "http",
			forward_port: 8080,
			access_list_id: 1,
			certificate_id: 1,
			meta: "{}",
		});
		await database("host_domain").insert([
			{ proxy_host_id: id, domain_name: `host-${id}.example.test` },
			{ proxy_host_id: id, domain_name: `alias-${id}.example.test` },
		]);
	}
}

describe.skipIf(!enabled)("opt-in Nginx configuration profiling", () => {
	afterAll(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});
	it("compares the original per-host graph against current code with identical fixtures", async () => {
		const sqlite = state.database;
		const refresh = nginx.getCurrentHost;
		const test = nginx.test;
		const filename = nginx.getConfigName;
		const render = nginx.renderConfig;
		const originalLock = nginx.withConfigurationLock;
		const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-nginx-profile-"));
		const hostDirectory = path.join(directory, "hosts");
		await fs.promises.mkdir(hostDirectory);
		await fs.promises.mkdir(path.join(directory, "logs"));
		const binary = process.env.SHIELDPM_NGINX_BENCHMARK_BINARY;
		const config = process.env.SHIELDPM_NGINX_BENCHMARK_CONFIG;
		const realValidation = Boolean(binary && config);
		const validationConfig = path.join(directory, "nginx.conf");
		let embedded;
		try {
			if (realValidation) {
				const master = await fs.promises.readFile(config, "utf8");
				expect(master, "benchmark master must include its generated fixture files").toContain(
					"{{HOST_CONFIG_DIRECTORY}}",
				);
				await fs.promises.writeFile(
					validationConfig,
					master.replaceAll("{{HOST_CONFIG_DIRECTORY}}", hostDirectory),
				);
				await fs.promises.cp(path.join(path.dirname(config), "conf.d"), path.join(directory, "conf.d"), {
					recursive: true,
				});
			}
			vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
			for (const [name, value] of Object.entries({
				DISABLE_HTTP: "false",
				DISABLE_IPV6: "true",
				IPV4_BINDING: "127.0.0.1",
				HTTP_PORT: "18080",
				HTTPS_PORT: "18443",
				DISABLE_H3_QUIC: "true",
				LISTEN_PROXY_PROTOCOL: "false",
			}))
				vi.stubEnv(name, value);
			for (const engine of (process.env.SHIELDPM_NGINX_BENCHMARK_ENGINES || "sqlite,postgres").split(",")) {
				state.engine = engine;
				if (engine === "postgres") {
					embedded = await createPostgres();
					state.database = embedded.database;
				} else state.database = sqlite;
				Model.knex(state.database);
				await prepareDatabase(state.database);
				nginx.getConfigName = (_kind, id) => path.join(hostDirectory, `${id}.conf`);
				// Table metadata, Liquid parsing and JIT initialization are not part of warm runs.
				await baselineRefresh(ProxyHost, "proxy_host", 1);
				await refresh(ProxyHost, "proxy_host", 1);
				await render("proxy_host", await baselineRefresh(ProxyHost, "proxy_host", 1));
				for (const size of sizes) {
					await fs.promises.rm(hostDirectory, { recursive: true, force: true });
					await fs.promises.mkdir(hostDirectory);
					const snapshots = Array.from({ length: size }, (_, index) => ({ id: index + 1 }));
					for (let round = 0; round < rounds; round++) {
						const outputHashes = [];
						// Alternate ordering to reduce warm-up/ordering bias.
						for (const strategy of round % 2 ? ["current", "baseline"] : ["baseline", "current"]) {
							// Both implementations replace identical existing files on every run.
							for (const host of snapshots)
								await fs.promises.writeFile(
									path.join(hostDirectory, `${host.id}.conf`),
									"# previous active config\n",
								);
							const metrics = {
								graphRefreshMs: 0,
								renderMs: 0,
								filesMs: 0,
								filesCumulativeMs: 0,
								sqlMs: 0,
								queries: 0,
								transactionCommands: 0,
								lockWaitMs: 0,
							};
							const pending = new Map();
							const queryStart = (query) => {
								// Knex emits no query-response event for BEGIN/COMMIT.
								if (!query.__knexQueryUid) {
									metrics.transactionCommands++;
									return;
								}
								metrics.queries++;
								pending.set(query.__knexQueryUid, performance.now());
							};
							const queryEnd = (_result, query) => {
								if (!query.__knexQueryUid) return;
								const started = pending.get(query.__knexQueryUid);
								if (started !== undefined) metrics.sqlMs += performance.now() - started;
								pending.delete(query.__knexQueryUid);
							};
							state.database.on("query", queryStart).on("query-response", queryEnd);
							nginx.getCurrentHost = async (...args) => {
								const started = performance.now();
								try {
									return await (strategy === "baseline" ? baselineRefresh : refresh)(...args);
								} finally {
									metrics.graphRefreshMs += performance.now() - started;
								}
							};
							nginx.renderConfig = async (...args) => {
								const started = performance.now();
								try {
									return await render(...args);
								} finally {
									metrics.renderMs += performance.now() - started;
								}
							};
							nginx.withConfigurationLock = (callback) => {
								const queued = performance.now();
								return originalLock(() => {
									metrics.lockWaitMs += performance.now() - queued;
									return callback();
								});
							};
							let validationMs = null;
							nginx.test = async () => {
								if (!realValidation) return;
								const started = performance.now();
								await utils.execFile(binary, ["-tq", "-c", validationConfig, "-p", directory]);
								validationMs = performance.now() - started;
							};
							let activeFiles = 0;
							let filesStarted = 0;
							const fileSpies = ["copyFile", "writeFile", "unlink", "rename"].map((method) => {
								const original = fs.promises[method];
								return vi.spyOn(fs.promises, method).mockImplementation(async (...args) => {
									const started = performance.now();
									if (activeFiles++ === 0) filesStarted = started;
									try {
										return await original(...args);
									} finally {
										metrics.filesCumulativeMs += performance.now() - started;
										if (--activeFiles === 0) metrics.filesMs += performance.now() - filesStarted;
									}
								});
							});
							const started = performance.now();
							try {
								const statuses = await nginx.bulkGenerateConfigs(ProxyHost, "proxy_host", snapshots);
								expect(statuses.every((status) => status.nginx_online)).toBe(true);
								const totalMs = performance.now() - started;
								const hash = createHash("sha256");
								for (const host of snapshots) {
									hash.update(`${host.id}\0`);
									hash.update(
										await fs.promises.readFile(path.join(hostDirectory, `${host.id}.conf`)),
									);
								}
								outputHashes.push(hash.digest("hex"));
								if (outputHashes.length === 2) expect(outputHashes[1]).toBe(outputHashes[0]);
								process.stdout.write(
									`NGINX_BENCHMARK ${JSON.stringify({
										engine,
										size,
										round,
										strategy,
										...metrics,
										totalMs,
										configSha256: outputHashes.at(-1),
										nginxTestMs: validationMs,
										validation: realValidation ? "external-nginx" : "not-run",
										lock: "uncontended",
										durations: "wall-phases;sql-overlaps-graph;filesCumulativeMs-is-additive",
										sqlTiming: "statements-excluding-transaction-control",
									})}\n`,
								);
							} finally {
								for (const spy of fileSpies) spy.mockRestore();
								state.database
									.removeListener("query", queryStart)
									.removeListener("query-response", queryEnd);
							}
						}
					}
				}
				if (embedded) {
					await embedded.close();
					embedded = undefined;
				}
			}
		} finally {
			Object.assign(nginx, {
				getCurrentHost: refresh,
				test,
				getConfigName: filename,
				renderConfig: render,
				withConfigurationLock: originalLock,
			});
			if (embedded) await embedded.close();
			await sqlite.destroy();
			await fs.promises.rm(directory, { recursive: true, force: true });
		}
	}, 300000);
});
