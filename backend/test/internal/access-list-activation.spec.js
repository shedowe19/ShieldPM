import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessListFiles } from "../../lib/access-list-files.js";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite" }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	getEncryptionKey: () => "1".repeat(64),
	isSqlite: () => state.engine === "sqlite",
	isPostgres: () => state.engine === "postgres",
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { start: vi.fn(), stop: vi.fn(), restart: vi.fn() } }));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));

import service from "../../internal/access-list.js";
import audit from "../../internal/audit-log.js";
import nginx from "../../internal/nginx.js";
import AccessList from "../../models/access_list.js";
import ProxyHost from "../../models/proxy_host.js";

const access = { can: vi.fn().mockResolvedValue({ permission_visibility: "all" }), token: { getUserId: () => 1 } };
const hash = `$2b$12$${"A".repeat(53)}`;
const pem = await fs.readFile(new URL("../fixtures/access-list-ca.pem", import.meta.url), "utf8");
describe.each(["sqlite", "postgres"])("access-list activation with %s", (engine) => {
	let embedded;
	let directory;
	let auth;
	let hostfile;
	let realTest;
	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		await state.db.schema.createTable("access_list", (t) => {
			t.increments("id");
			t.string("name");
			t.integer("owner_user_id");
			for (const field of ["is_deleted", "satisfy_any", "pass_auth", "mtls_enabled", "mtls_use_internal"])
				t.boolean(field).defaultTo(false);
			t.text("mtls_certificate");
			t.text("meta");
			t.string("created_on");
			t.string("modified_on");
		});
		for (const table of ["access_list_auth", "access_list_client"])
			await state.db.schema.createTable(table, (t) => {
				t.increments("id");
				t.integer("access_list_id");
				for (const field of table.endsWith("auth") ? ["username", "password"] : ["address", "directive"])
					t.string(field);
				t.text("meta");
				t.string("created_on");
				t.string("modified_on");
			});
		await state.db.schema.createTable("proxy_host", (t) => {
			t.increments("id");
			t.integer("access_list_id");
			t.boolean("upload_relay_enabled");
			t.text("meta");
			t.string("modified_on");
		});
	});
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-access-activation-"));
		auth = path.join(directory, "access");
		hostfile = path.join(directory, "host.conf");
		await fs.writeFile(auth, "previous:hash\n", { mode: 0o640 });
		await fs.writeFile(`${auth}.crt`, pem, { mode: 0o640 });
		await fs.writeFile(hostfile, "# previous working host\n");
		for (const table of ["access_list_auth", "access_list_client", "access_list", "proxy_host"])
			await state.db(table).delete();
		await state.db("access_list").insert({
			id: 1,
			name: "Original",
			owner_user_id: 1,
			meta: "{}",
			mtls_enabled: true,
			mtls_use_internal: false,
			mtls_certificate: pem,
		});
		await state.db("access_list_auth").insert({ id: 1, access_list_id: 1, username: "previous", password: hash });
		await state
			.db("access_list_client")
			.insert({ id: 1, access_list_id: 1, address: "10.0.0.0/8", directive: "allow" });
		await state.db("proxy_host").insert({
			id: 1,
			access_list_id: 1,
			upload_relay_enabled: false,
			meta: JSON.stringify({ nginx_online: true, note: "keep" }),
		});
		vi.spyOn(service, "getFilename").mockReturnValue(auth);
		vi.spyOn(service, "get").mockImplementation(async () => {
			const list = await AccessList.query().findById(1);
			return {
				...JSON.parse(JSON.stringify(list)),
				items: await state.db("access_list_auth"),
				clients: await state.db("access_list_client"),
				proxy_host_count: 1,
				proxy_hosts: [
					{
						...(await ProxyHost.query().findById(1)),
						enabled: true,
						host_domains: [],
						$fetchGraph: async () => {},
					},
				],
			};
		});
		vi.spyOn(nginx, "getConfigName").mockReturnValue(hostfile);
		vi.spyOn(nginx, "getCurrentHost").mockImplementation(async () => ({
			...(await ProxyHost.query().findById(1)),
			enabled: true,
			host_domains: [],
			$fetchGraph: async () => {},
		}));
		vi.spyOn(nginx, "generateConfig").mockImplementation(async () => {
			await fs.writeFile(hostfile, "# replacement\n");
		});
		vi.spyOn(nginx, "test").mockResolvedValue("");
		vi.spyOn(nginx, "reload").mockImplementation(() => nginx.test());
		audit.add.mockClear();
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.rm(directory, { recursive: true, force: true });
	});
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});
	it.each([
		{ id: "../../outside", username: "invalid:username", password: "unused" },
		{ id: 1, username: "invalid:username", password: "unused" },
		{ id: 1, username: "candidate", password: 123 },
	])("never cleans up a supplied ID after an uncommitted create failure: %j", async (input) => {
		if (engine === "postgres")
			await state.db.raw("SELECT setval(pg_get_serial_sequence('access_list', 'id'), 1, true)");
		const original = await state.db("access_list");
		const credentials = await state.db("access_list_auth");
		const remove = vi.spyOn(fs, "rm");
		await expect(
			service.create(access, {
				id: input.id,
				name: "Rejected",
				items: [{ username: input.username, password: input.password }],
			}),
		).rejects.toThrow();
		expect(await state.db("access_list")).toEqual(original);
		expect(await state.db("access_list_auth")).toEqual(credentials);
		expect(await fs.readFile(auth, "utf8")).toBe("previous:hash\n");
		expect(await fs.readFile(`${auth}.crt`, "utf8")).toBe(pem);
		expect(remove).not.toHaveBeenCalled();
	});
	it("compensates only its committed server-created ID after a later failure", async () => {
		if (engine === "postgres")
			await state.db.raw("SELECT setval(pg_get_serial_sequence('access_list', 'id'), 1, true)");
		service.getFilename.mockImplementation(({ id }) => (id === 1 ? auth : `${auth}.${id}`));
		service.get.mockRejectedValueOnce(new Error("Post-insert read failed"));
		const remove = vi.spyOn(fs, "rm");
		await expect(service.create(access, { id: 1, name: "Candidate", items: [] })).rejects.toThrow(
			"Post-insert read failed",
		);
		expect((await state.db("access_list")).map((list) => list.id)).toEqual([1]);
		expect(await fs.readFile(auth, "utf8")).toBe("previous:hash\n");
		expect(remove).toHaveBeenCalledWith(`${auth}.2`, { force: true });
		expect(remove).toHaveBeenCalledWith(`${auth}.2.crt`, { force: true });
		expect(remove).not.toHaveBeenCalledWith(auth, expect.anything());
	});
	it("rejects malformed CA before publishing passwords or committing DB edits", async () => {
		const before = await state.db("access_list_auth");
		await expect(
			service.update(access, {
				id: 1,
				name: "Changed",
				mtls_certificate: "INVALID",
				items: [{ username: "new", password: hash }],
			}),
		).rejects.toThrow("valid PEM");
		expect(await fs.readFile(auth, "utf8")).toBe("previous:hash\n");
		expect(await fs.readFile(`${auth}.crt`, "utf8")).toBe(pem);
		expect(await state.db("access_list_auth")).toEqual(before);
		expect((await state.db("access_list").first()).name).toBe("Original");
		expect(audit.add).not.toHaveBeenCalled();
	});
	it("restores DB credentials, rules and all active sidecars after rejected Nginx validation", async () => {
		nginx.test.mockRejectedValueOnce(new Error("nginx rejected candidate"));
		await expect(
			service.update(access, {
				id: 1,
				name: "Changed",
				mtls_certificate: `${pem}\n`,
				items: [{ username: "new", password: hash }],
				clients: [{ address: "all", directive: "deny" }],
			}),
		).rejects.toThrow("rejected candidate");
		expect((await state.db("access_list").first()).name).toBe("Original");
		expect((await state.db("access_list_auth").first()).username).toBe("previous");
		expect((await state.db("access_list_client").first()).address).toBe("10.0.0.0/8");
		expect(await fs.readFile(auth, "utf8")).toBe("previous:hash\n");
		expect(await fs.readFile(`${auth}.crt`, "utf8")).toBe(pem);
		expect((await fs.stat(auth)).mode & 0o777).toBe(0o640);
		expect(await fs.readFile(hostfile, "utf8")).toBe("# previous working host\n");
		expect(audit.add).not.toHaveBeenCalled();
	});
	it("rolls back deletion and host authorization references when reload fails", async () => {
		nginx.reload.mockRejectedValueOnce(new Error("reload failed"));
		await expect(service.delete(access, { id: 1 })).rejects.toThrow("reload failed");
		expect(Boolean((await state.db("access_list").first()).is_deleted)).toBe(false);
		expect((await state.db("proxy_host").first()).access_list_id).toBe(1);
		expect(await fs.readFile(auth, "utf8")).toBe("previous:hash\n");
		expect(await fs.readFile(hostfile, "utf8")).toBe("# previous working host\n");
	});
	it("commits credentials only with a validated complete host batch", async () => {
		await service.update(access, { id: 1, name: "Updated", items: [{ username: "new", password: hash }] });
		expect((await state.db("access_list").first()).name).toBe("Updated");
		const saved = await AccessList.query().findById(1);
		expect(await fs.readFile(accessListFiles(saved, auth).auth, "utf8")).toBe(`new:${hash}\n`);
		expect(await fs.readFile(auth, "utf8")).toBe("previous:hash\n");
		expect(audit.add).toHaveBeenCalledOnce();
	});
	it.skipIf(!process.env.SHIELDPM_NGINX_TEST_BINARY || !existsSync(process.env.SHIELDPM_NGINX_TEST_BINARY))(
		"never exposes candidate credentials to running workers during delayed rejected validation",
		async () => {
			const binary = process.env.SHIELDPM_NGINX_TEST_BINARY;
			const listener = net.createServer();
			await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
			const port = listener.address().port;
			await new Promise((resolve) => listener.close(resolve));
			const oldHash = bcrypt.hashSync("old-password", 4);
			const newHash = bcrypt.hashSync("new-password", 4);
			await fs.writeFile(auth, `previous:${oldHash}\n`);
			await state.db("access_list_auth").where("id", 1).update({ password: oldHash });
			await fs.writeFile(path.join(directory, "index.html"), "WORKING");
			await fs.mkdir(path.join(directory, "logs"));
			const master = path.join(directory, "running.conf");
			const luaPath = process.env.SHIELDPM_NGINX_TEST_LUA_PATH;
			const luaCpath = process.env.SHIELDPM_NGINX_TEST_LUA_CPATH;
			const original = `server { listen 127.0.0.1:${port}; root ${directory}; location / { auth_basic "test"; auth_basic_user_file ${auth}; } }\n`;
			await fs.writeFile(hostfile, original);
			await fs.writeFile(
				master,
				`user root; pid ${directory}/running.pid; error_log ${directory}/error.log; events {} http { ${luaPath ? `lua_package_path ${JSON.stringify(luaPath)};` : ""} ${luaCpath ? `lua_package_cpath ${JSON.stringify(luaCpath)};` : ""} access_log off; client_body_temp_path ${directory}/body; proxy_temp_path ${directory}/proxy; fastcgi_temp_path ${directory}/fastcgi; uwsgi_temp_path ${directory}/uwsgi; scgi_temp_path ${directory}/scgi; include ${hostfile}; }\n`,
			);
			const test = () =>
				execFileSync(binary, ["-p", directory, "-c", master, "-tq"], { stdio: ["ignore", "pipe", "pipe"] });
			test();
			execFileSync(binary, ["-p", directory, "-c", master], { stdio: ["ignore", "pipe", "pipe"] });
			let release;
			let entered;
			const gate = new Promise((resolve) => {
				release = resolve;
			});
			const started = new Promise((resolve) => {
				entered = resolve;
			});
			nginx.test.mockImplementationOnce(async () => {
				entered();
				await gate;
				test();
			});
			nginx.generateConfig.mockImplementation(async () => {
				const candidate = await AccessList.query().findById(1);
				const candidatePath = accessListFiles(candidate, auth).auth;
				expect(candidatePath).not.toBe(auth);
				await fs.writeFile(hostfile, `${original.replace(auth, candidatePath)}invalid_directive;\n`);
			});
			const request = (username, password) =>
				fetch(`http://127.0.0.1:${port}/`, {
					headers: {
						Connection: "close",
						Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
					},
				});
			try {
				const pending = service
					.update(access, { id: 1, items: [{ username: "candidate", password: newHash }] })
					.catch((error) => error);
				await started;
				expect((await request("previous", "old-password")).status).toBe(200);
				expect((await request("candidate", "new-password")).status).toBe(401);
				expect(await fs.readFile(auth, "utf8")).toBe(`previous:${oldHash}\n`);
				release();
				expect(await pending).toBeInstanceOf(Error);
				expect((await request("previous", "old-password")).status).toBe(200);
				expect(await fs.readFile(hostfile, "utf8")).toBe(original);
			} finally {
				release();
				execFileSync(binary, ["-p", directory, "-c", master, "-s", "quit"], {
					stdio: ["ignore", "pipe", "pipe"],
				});
			}
		},
		20_000,
	);

	it.skipIf(!process.env.SHIELDPM_NGINX_TEST_BINARY || !existsSync(process.env.SHIELDPM_NGINX_TEST_BINARY))(
		"keeps the previous configuration valid with a real Nginx parser after a rejected update",
		async () => {
			const binary = process.env.SHIELDPM_NGINX_TEST_BINARY;
			const master = path.join(directory, "nginx.conf");
			const key = path.join(directory, "server.key");
			const cert = path.join(directory, "server.crt");
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
					"/CN=example.test",
					"-keyout",
					key,
					"-out",
					cert,
				],
				{ stdio: "ignore" },
			);
			const original = `server { listen 127.0.0.1:19981 ssl; ssl_certificate ${cert}; ssl_certificate_key ${key}; ssl_client_certificate ${auth}.crt; ssl_verify_client on; location / { auth_basic "test"; auth_basic_user_file ${auth}; return 200; } }\n`;
			await fs.writeFile(hostfile, original);
			await fs.writeFile(
				master,
				`user root;\npid ${directory}/nginx.pid;\nerror_log ${directory}/error.log;\nevents {}\nhttp { client_body_temp_path ${directory}/body; proxy_temp_path ${directory}/proxy; fastcgi_temp_path ${directory}/fastcgi; uwsgi_temp_path ${directory}/uwsgi; scgi_temp_path ${directory}/scgi; include ${hostfile}; }\n`,
			);
			await fs.mkdir(path.join(directory, "logs"));
			realTest = () =>
				execFileSync(binary, ["-p", directory, "-c", master, "-tq"], { stdio: ["ignore", "pipe", "pipe"] });
			realTest();
			nginx.test.mockImplementation(async () => realTest());
			nginx.generateConfig.mockImplementation(async () => {
				await fs.writeFile(hostfile, `${original}invalid_directive;\n`);
			});
			await expect(
				service.update(access, {
					id: 1,
					mtls_certificate: `${pem}\n`,
					items: [{ username: "new", password: hash }],
				}),
			).rejects.toThrow();
			expect(await fs.readFile(hostfile, "utf8")).toBe(original);
			expect(await fs.readFile(auth, "utf8")).toBe("previous:hash\n");
			expect(await fs.readFile(`${auth}.crt`, "utf8")).toBe(pem);
			expect(() => realTest()).not.toThrow();
		},
	);
});
