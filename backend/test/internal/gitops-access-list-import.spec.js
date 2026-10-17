import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const state = vi.hoisted(() => ({ database: null, directory: "" }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	isDemoMode: () => false,
	getEncryptionKey: () => "4".repeat(64),
}));
vi.mock("../../internal/proxy-host.js", () => ({ reconcileRestoredHost: vi.fn() }));
vi.mock("../../internal/cloudflared.js", () => ({ default: { stop: vi.fn(), activateImported: vi.fn() } }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ assertMonitorConfig: vi.fn(), default: {} }));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal();
	const map = (value) =>
		typeof value === "string" && value.startsWith("/data/gitops")
			? value.replace("/data/gitops", state.directory)
			: value;
	const promises = new Proxy(actual.default.promises, {
		get: (target, key) =>
			typeof target[key] === "function" ? (...args) => target[key](...args.map(map)) : target[key],
	});
	return {
		...actual,
		default: { ...actual.default, existsSync: (value) => actual.default.existsSync(map(value)), promises },
	};
});
vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal();
	const map = (value) =>
		typeof value === "string" && value.startsWith("/data/gitops")
			? value.replace("/data/gitops", state.directory)
			: value;
	const mapped = Object.fromEntries(
		Object.entries(actual).map(([key, value]) => [
			key,
			typeof value === "function" ? (...args) => value(...args.map(map)) : value,
		]),
	);
	return { ...mapped, default: mapped };
});

import gitops from "../../internal/gitops.js";
import nginx from "../../internal/nginx.js";
import { accessListFiles } from "../../lib/access-list-files.js";
import { withHostDomainClaims } from "../../lib/host-domain-claims.js";
import AccessList from "../../models/access_list.js";
import ProxyHost from "../../models/proxy_host.js";

const binary = process.env.SHIELDPM_NGINX_TEST_BINARY;
const hasRuntime = !!binary && existsSync(binary);
const access = { can: async () => ({ permission_visibility: "all" }), token: { getUserId: () => 1 } };
const previousVersion = "a".repeat(64);
const foreignVersion = "f".repeat(64);
const oldHash = bcrypt.hashSync("old-password", 4);
const getList = () => AccessList.query().findById(1).withGraphFetched("[items,clients]");
const configFile = () => path.join(state.directory, "host.conf");
const importFile = () => path.join(state.directory, "shieldpm-config/access-lists/1.yaml");
const writeImport = (data = {}) =>
	fs.writeFile(
		importFile(),
		JSON.stringify({
			id: 1,
			name: "Imported",
			owner_user_id: 1,
			items: [{ username: "candidate", password: "candidate-password" }],
			clients: [],
			meta: { authorization_revision: foreignVersion },
			...data,
		}),
	);
const importAll = () => gitops.importConfig(access, { overwrite: true });
const snapshot = async () => JSON.parse(JSON.stringify(await getList()));

describe("GitOps imports local immutable authorization artifacts", () => {
	let certificate;
	let certificateDirectory;
	let runtime;
	beforeAll(async () => {
		const migrations = backendSourcePath("migrations");
		for (const filename of (await fs.readdir(migrations)).filter((name) => name.endsWith(".js")).sort())
			await (await import(path.join(migrations, filename))).up(state.database);
		certificate = await fs.readFile(new URL("../fixtures/access-list-ca.pem", import.meta.url), "utf8");
		if (hasRuntime) {
			certificateDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-gitops-acl-tls-"));
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
					"/CN=localhost",
					"-addext",
					"basicConstraints=critical,CA:TRUE",
					"-keyout",
					path.join(certificateDirectory, "key.pem"),
					"-out",
					path.join(certificateDirectory, "ca.pem"),
				],
				{ stdio: "ignore" },
			);
			certificate = await fs.readFile(path.join(certificateDirectory, "ca.pem"), "utf8");
		}
	});
	beforeEach(async () => {
		state.directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-gitops-acl-"));
		vi.stubEnv("DATA_PATH", path.join(state.directory, "data"));
		await fs.mkdir(path.dirname(importFile()), { recursive: true });
		await fs.mkdir(path.join(process.env.DATA_PATH, "access"), { recursive: true });
		for (const table of [
			"proxy_host_revision",
			"host_domain_claim_owner",
			"host_domain_claim",
			"host_domain",
			"proxy_host",
			"access_list_auth",
			"access_list_client",
			"access_list",
		])
			await state.database(table).delete();
		await AccessList.query().insertGraph({
			id: 1,
			owner_user_id: 1,
			name: "Previous",
			satisfy_any: false,
			mtls_enabled: false,
			mtls_certificate: "",
			meta: { authorization_revision: previousVersion },
			items: [{ username: "previous", password: oldHash }],
			clients: [],
		});
		await withHostDomainClaims({ hostType: "proxy", domainNames: ["acl.example"] }, (trx) =>
			ProxyHost.query(trx).insertGraph({
				id: 1,
				owner_user_id: 1,
				forward_scheme: "http",
				forward_host: "127.0.0.1",
				forward_port: 8080,
				enabled: true,
				access_list_id: 1,
				meta: { nginx_online: true },
				host_domains: [{ domain_name: "acl.example" }],
			}),
		);
		await fs.writeFile(accessListFiles(await getList()).auth, `previous:${oldHash}\n`, { mode: 0o600 });
		await fs.writeFile(configFile(), "# accepted previous listener\n", { mode: 0o640 });
		vi.spyOn(nginx, "getConfigName").mockImplementation(() => configFile());
		vi.spyOn(nginx, "reload").mockResolvedValue("");
		vi.spyOn(nginx, "bulkGenerateConfigGroupsUnlocked").mockResolvedValue([]);
		runtime = null;
	});
	afterEach(async () => {
		if (runtime) {
			try {
				execFileSync(binary, ["-p", state.directory, "-c", runtime.master, "-s", "quit"], { stdio: "ignore" });
			} catch {}
		}
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await fs.rm(state.directory, { recursive: true, force: true });
	});
	afterAll(async () => {
		await state.database.destroy();
		if (certificateDirectory) await fs.rm(certificateDirectory, { recursive: true, force: true });
	});

	it("replaces a foreign revision with complete local bcrypt and CA artifacts before staging hosts", async () => {
		const previous = accessListFiles(await getList());
		await writeImport({ mtls_enabled: true, mtls_certificate: certificate });
		vi.mocked(nginx.bulkGenerateConfigGroupsUnlocked).mockImplementationOnce(async () => {
			const list = await getList();
			expect(list.meta.authorization_revision).toMatch(/^[a-f0-9]{64}$/);
			expect(list.meta.authorization_revision).not.toBe(foreignVersion);
			expect(list.meta.authorization_revision).not.toBe(previousVersion);
			const files = accessListFiles(list);
			expect(await fs.readFile(files.ca, "utf8")).toBe(certificate);
			expect(bcrypt.getRounds(list.items[0].password)).toBe(13);
			expect(await bcrypt.compare("candidate-password", list.items[0].password)).toBe(true);
			expect(await fs.readFile(files.auth, "utf8")).toBe(`candidate:${list.items[0].password}\n`);
			expect((await fs.stat(files.auth)).mode & 0o777).toBe(0o600);
		});
		expect(await importAll()).toMatchObject({ success: true, imported: 1 });
		expect(await fs.readFile(previous.auth, "utf8")).toBe(`previous:${oldHash}\n`);
	});
	it("keeps existing credentials when a partial imported list changes only metadata", async () => {
		await fs.writeFile(
			importFile(),
			JSON.stringify({
				id: 1,
				name: "Renamed",
				meta: { note: "metadata only", authorization_revision: foreignVersion },
			}),
		);
		expect(await importAll()).toMatchObject({ success: true });
		const list = await getList();
		expect(list.items).toMatchObject([{ username: "previous", password: oldHash }]);
		expect(await fs.readFile(accessListFiles(list).auth, "utf8")).toBe(`previous:${oldHash}\n`);
	});
	it("restores exact shared DB state after an invalid imported CA", async () => {
		const previous = await snapshot();
		await writeImport({ mtls_enabled: true, mtls_certificate: "INVALID" });
		expect(await importAll()).toMatchObject({ success: false });
		expect(await snapshot()).toEqual(previous);
		expect(await fs.readFile(accessListFiles(previous).auth, "utf8")).toBe(`previous:${oldHash}\n`);
	});
	it("compensates the shared list and active listener after rejected final activation", async () => {
		const previous = await snapshot();
		await writeImport();
		vi.mocked(nginx.bulkGenerateConfigGroupsUnlocked).mockImplementationOnce(async () => {
			const candidate = await getList();
			expect(candidate.meta.authorization_revision).not.toBe(foreignVersion);
			await fs.writeFile(configFile(), "# rejected listener\n");
			throw new Error("Rejected final reload");
		});
		expect(await importAll()).toMatchObject({ success: false });
		expect(await snapshot()).toEqual(previous);
		expect(await fs.readFile(configFile(), "utf8")).toBe("# accepted previous listener\n");
		expect(await fs.readFile(accessListFiles(previous).auth, "utf8")).toBe(`previous:${oldHash}\n`);
	});
	it("rejects duplicate imported IDs before concurrent writes can mix credential sets", async () => {
		await writeImport();
		await fs.writeFile(
			path.join(path.dirname(importFile()), "duplicate.yaml"),
			JSON.stringify({
				id: 1,
				name: "Duplicate",
				items: [{ username: "duplicate", password: oldHash }],
			}),
		);
		const result = await importAll();
		expect(result).toMatchObject({ success: false, imported: 1 });
		expect(result.errors.join(" ")).toContain("Duplicate imported Access List ID");
		const list = await getList();
		expect(list.items).toHaveLength(1);
		expect(await fs.readFile(accessListFiles(list).auth, "utf8")).toBe(
			`${list.items[0].username}:${list.items[0].password}\n`,
		);
	});
	it("never activates a new public host when its newly imported authorization list fails", async () => {
		await fs.writeFile(importFile(), JSON.stringify({ id: 1, name: "Keep existing" }));
		await fs.writeFile(
			path.join(path.dirname(importFile()), "2.yaml"),
			JSON.stringify({
				id: 2,
				owner_user_id: 1,
				name: "Invalid new list",
				mtls_enabled: true,
				mtls_certificate: "INVALID",
				items: [{ username: "protected", password: "synthetic-key" }],
			}),
		);
		const proxyDirectory = path.join(state.directory, "shieldpm-config/proxy-hosts");
		await fs.mkdir(proxyDirectory);
		await fs.writeFile(
			path.join(proxyDirectory, "2.yaml"),
			JSON.stringify({
				id: 2,
				owner_user_id: 1,
				access_list_id: 2,
				enabled: true,
				domain_names: ["protected.example"],
				forward_scheme: "http",
				forward_host: "127.0.0.1",
				forward_port: 8081,
			}),
		);
		let staged = [];
		vi.mocked(nginx.bulkGenerateConfigGroupsUnlocked).mockImplementationOnce(async (groups) => {
			staged = groups.find((group) => group.hostType === "proxy_host").hosts.map((host) => host.id);
		});
		expect(await importAll()).toMatchObject({ success: false });
		expect(staged).not.toContain(2);
		expect(await AccessList.query().findById(2)).toBeUndefined();
		expect(await ProxyHost.query().where("id", 2).where("is_deleted", 0)).toHaveLength(0);
		expect(await state.database("host_domain_claim_owner").where({ host_type: "proxy", host_id: 2 })).toHaveLength(
			0,
		);
		expect(await getList()).toMatchObject({ items: [{ username: "previous", password: oldHash }] });
	});

	const startRuntime = async (tls = false) => {
		const listener = net.createServer();
		await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
		const port = listener.address().port;
		await new Promise((resolve) => listener.close(resolve));
		await fs.mkdir(path.join(state.directory, "logs"));
		await fs.writeFile(path.join(state.directory, "index.html"), "AUTHORIZED");
		const server = (list) => {
			const files = accessListFiles(list);
			return `server { listen 127.0.0.1:${port}${tls ? " ssl" : ""}; ${tls ? `ssl_certificate ${certificateDirectory}/ca.pem; ssl_certificate_key ${certificateDirectory}/key.pem;` : ""} ${list.mtls_enabled ? `ssl_client_certificate ${files.ca}; ssl_verify_client on;` : ""} root ${state.directory}; location / { auth_basic "test"; auth_basic_user_file ${files.auth}; } }\n`;
		};
		await fs.writeFile(configFile(), server(await getList()));
		const master = path.join(state.directory, "nginx.conf");
		const luaPath = process.env.SHIELDPM_NGINX_TEST_LUA_PATH || process.env.SHIELDPM_WASM_LUA_PATH;
		const luaCpath = process.env.SHIELDPM_NGINX_TEST_LUA_CPATH || process.env.SHIELDPM_WASM_LUA_CPATH;
		await fs.writeFile(
			master,
			`user root; pid ${state.directory}/nginx.pid; error_log ${state.directory}/error.log; events {} http { ${luaPath ? `lua_package_path ${JSON.stringify(luaPath)};` : ""} ${luaCpath ? `lua_package_cpath ${JSON.stringify(luaCpath)};` : ""} access_log off; client_body_temp_path ${state.directory}/body; proxy_temp_path ${state.directory}/proxy; fastcgi_temp_path ${state.directory}/fastcgi; uwsgi_temp_path ${state.directory}/uwsgi; scgi_temp_path ${state.directory}/scgi; include ${configFile()}; }`,
		);
		const test = () =>
			execFileSync(binary, ["-p", state.directory, "-c", master, "-tq"], { stdio: ["ignore", "pipe", "pipe"] });
		test();
		execFileSync(binary, ["-p", state.directory, "-c", master], { stdio: ["ignore", "pipe", "pipe"] });
		runtime = { master, port, test };
		vi.mocked(nginx.bulkGenerateConfigGroupsUnlocked).mockRestore();
		vi.spyOn(nginx, "test").mockImplementation(async () => test());
		vi.mocked(nginx.reload).mockImplementation(async () => {
			await nginx.test();
			execFileSync(binary, ["-p", state.directory, "-c", master, "-s", "reload"], {
				stdio: ["ignore", "pipe", "pipe"],
			});
			return "";
		});
		vi.spyOn(nginx, "generateConfig").mockImplementation(async () =>
			fs.writeFile(configFile(), server(await getList())),
		);
		return { server };
	};
	const request = async (username, password, tls = false, client = false) => {
		const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
		if (!tls) {
			const response = await fetch(`http://127.0.0.1:${runtime.port}/`, {
				headers: { Authorization: authorization, Connection: "close" },
			});
			return { status: response.status, body: await response.text() };
		}
		const cert = client ? await fs.readFile(path.join(certificateDirectory, "ca.pem")) : undefined;
		const key = client ? await fs.readFile(path.join(certificateDirectory, "key.pem")) : undefined;
		return new Promise((resolve, reject) => {
			const req = https.request(
				{
					host: "127.0.0.1",
					port: runtime.port,
					rejectUnauthorized: false,
					cert,
					key,
					headers: { Authorization: authorization, Connection: "close" },
				},
				(response) => {
					let body = "";
					response.on("data", (chunk) => {
						body += chunk;
					});
					response.on("end", () => resolve({ status: response.statusCode, body }));
				},
			);
			req.on("error", reject);
			req.end();
		});
	};
	it.skipIf(!hasRuntime)(
		"activates imported Basic credentials against actual Nginx",
		async () => {
			await startRuntime();
			expect((await request("previous", "old-password")).status).toBe(200);
			await writeImport();
			expect(await importAll()).toMatchObject({ success: true });
			await vi.waitFor(async () => expect((await request("candidate", "candidate-password")).status).toBe(200), {
				timeout: 5_000,
			});
			expect((await request("previous", "old-password")).status).toBe(401);
		},
		15_000,
	);
	it.skipIf(!hasRuntime)(
		"activates imported client CA together with Basic credentials against actual Nginx",
		async () => {
			await startRuntime(true);
			await writeImport({ mtls_enabled: true, mtls_certificate: certificate });
			expect(await importAll()).toMatchObject({ success: true });
			await vi.waitFor(
				async () => expect((await request("candidate", "candidate-password", true, true)).status).toBe(200),
				{ timeout: 5_000 },
			);
			expect((await request("candidate", "candidate-password", true, false)).status).toBe(400);
			expect((await request("candidate", "wrong", true, true)).status).toBe(401);
		},
		15_000,
	);
	it.skipIf(!hasRuntime)(
		"retains candidate artifacts after a real reload followed by failed status persistence",
		async () => {
			await startRuntime();
			const previous = await snapshot();
			let entered;
			let release;
			const committed = new Promise((resolve) => {
				entered = resolve;
			});
			const gate = new Promise((resolve) => {
				release = resolve;
			});
			vi.spyOn(nginx, "commitStagedConfig").mockImplementationOnce(async () => {
				entered();
				await gate;
				throw new Error("Status persistence failed after successful reload");
			});
			await writeImport();
			const pending = importAll();
			await committed;
			const candidate = accessListFiles(await getList());
			let contents;
			let result;
			try {
				await vi.waitFor(
					async () => expect((await request("candidate", "candidate-password")).status).toBe(200),
					{ timeout: 5_000, interval: 50 },
				);
				contents = await fs.readFile(candidate.auth, "utf8");
			} finally {
				release();
				result = await pending;
			}
			expect(result).toMatchObject({ success: false });
			expect(await snapshot()).toEqual(previous);
			await vi.waitFor(async () => expect((await request("previous", "old-password")).status).toBe(200));
			// A signalled candidate generation can still have draining workers using this file.
			expect(await fs.readFile(candidate.auth, "utf8")).toBe(contents);
			expect((await fs.stat(candidate.auth)).mode & 0o777).toBe(0o600);
		},
		15_000,
	);
	it.skipIf(!hasRuntime)(
		"keeps old workers and shared DB credentials through delayed rejected activation",
		async () => {
			const { server } = await startRuntime();
			const previous = await snapshot();
			let release;
			let entered;
			const gate = new Promise((resolve) => {
				release = resolve;
			});
			const staged = new Promise((resolve) => {
				entered = resolve;
			});
			nginx.test.mockImplementationOnce(async () => {
				entered();
				await gate;
				runtime.test();
			});
			nginx.generateConfig.mockImplementationOnce(async () =>
				fs.writeFile(configFile(), `${server(await getList())}invalid_directive;\n`),
			);
			await writeImport();
			const pending = importAll();
			await staged;
			let result;
			try {
				expect((await request("previous", "old-password")).status).toBe(200);
				expect((await request("candidate", "candidate-password")).status).toBe(401);
			} finally {
				release();
				result = await pending;
			}
			expect(result).toMatchObject({ success: false });
			expect(await snapshot()).toEqual(previous);
			expect((await request("previous", "old-password")).status).toBe(200);
			expect((await request("candidate", "candidate-password")).status).toBe(401);
		},
		15_000,
	);
});
