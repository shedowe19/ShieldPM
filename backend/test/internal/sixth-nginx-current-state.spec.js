import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgres } from "../helpers/postgres.js";

const state = vi.hoisted(() => ({ db: null, engine: "sqlite" }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => state.engine === "sqlite",
	isPostgres: () => state.engine === "postgres",
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: vi.fn() } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));

import nginx from "../../internal/nginx.js";
import utils from "../../lib/utils.js";
import ProxyHost from "../../models/proxy_host.js";

const graph = "[host_domains,certificate,access_list.[clients,items]]";
const currentHost = () => ProxyHost.query().findById(7).withGraphFetched(graph);

describe.each(["sqlite", "postgres"])("queued Nginx jobs use current persisted host configuration in %s", (engine) => {
	let directory;
	let embedded;
	beforeAll(async () => {
		state.engine = engine;
		if (engine === "postgres") {
			embedded = await createPostgres();
			state.db = embedded.database;
			Model.knex(state.db);
		}
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			for (const field of ["forward_host", "forward_scheme", "domain_names", "meta", "modified_on"])
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
		for (const name of ["certificate", "access_list"])
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("is_deleted").defaultTo(0);
				table.text("meta");
				table.text("provider");
			});
		for (const name of ["access_list_auth", "access_list_client"])
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("access_list_id");
				table.text("username");
			});
	});
	beforeEach(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "shieldpm-current-nginx-"));
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
		vi.spyOn(nginx, "getConfigName").mockImplementation((_kind, id) => path.join(directory, `${id}.conf`));
		vi.spyOn(utils, "execFile").mockResolvedValue("");
		for (const table of ["host_domain", "proxy_host", "certificate", "access_list", "access_list_auth"])
			await state.db(table).delete();
		await state.db("proxy_host").insert({
			id: 7,
			forward_host: "old-upstream.test",
			forward_scheme: "http",
			forward_port: 8080,
			meta: JSON.stringify({ revision: "old" }),
		});
		await state.db("host_domain").insert({ proxy_host_id: 7, domain_name: "old.example.test" });
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await fs.promises.rm(directory, { recursive: true, force: true });
	});
	afterAll(async () => {
		if (embedded) await embedded.close();
		else await state.db.destroy();
	});

	it("does not remove new authentication, domains or TLS when an older bulk snapshot arrives later", async () => {
		// Access-list/setup bulk jobs load all hosts before processing the first one.
		const staleSnapshot = await currentHost();
		await state.db("certificate").insert({ id: 3, provider: "internal", meta: "{}" });
		await state.db("access_list").insert({ id: 4, meta: "{}" });
		await state.db("access_list_auth").insert({ access_list_id: 4, username: "protected-user" });
		await ProxyHost.query()
			.findById(7)
			.patch({
				forward_host: "new-upstream.test",
				access_list_id: 4,
				certificate_id: 3,
				meta: { revision: "new" },
			});
		await state.db("host_domain").where("proxy_host_id", 7).update({ domain_name: "new.example.test" });
		await nginx.configure(ProxyHost, "proxy_host", await currentHost());
		await nginx.bulkGenerateConfigs(ProxyHost, "proxy_host", [staleSnapshot]);
		const config = await fs.promises.readFile(nginx.getConfigName("proxy_host", 7), "utf8");
		expect(config).toContain("auth_basic_user_file  /data/access/4;");
		expect(config).toContain("/data/tls/internal/npm-3/fullchain.pem");
		expect(config).toContain("server_name new.example.test;");
		expect(config).toContain("http://new-upstream.test:8080");
		expect(config).not.toContain("old-upstream.test");
		expect((await currentHost()).meta).toMatchObject({ revision: "new", nginx_online: true });
	});

	it("does not return legacy DNS credentials while refreshing the stored render graph", async () => {
		await ProxyHost.query()
			.findById(7)
			.patch({ meta: { dns_provider_credentials: "legacy-secret", note: "keep" } });
		const snapshot = await currentHost();
		snapshot.meta = { note: "keep" };
		expect(await nginx.configure(ProxyHost, "proxy_host", snapshot)).toEqual({
			note: "keep",
			nginx_online: true,
			nginx_err: null,
		});
	});

	it.each([false, true])("preserves metadata saved during a delayed reload with failure=%s", async (failReload) => {
		const enteredReload = Promise.withResolvers();
		const releaseReload = Promise.withResolvers();
		utils.execFile.mockImplementationOnce(async () => {
			enteredReload.resolve();
			await releaseReload.promise;
			if (failReload) throw new Error("reload rejected");
			return "";
		});
		const pending = nginx.configure(ProxyHost, "proxy_host", await currentHost());
		await enteredReload.promise;
		await ProxyHost.query()
			.findById(7)
			.patch({ meta: { revision: "changed-during-reload", keep: "new-setting" } });
		releaseReload.resolve();
		const result = await pending;
		expect((await currentHost()).meta).toMatchObject({ revision: "changed-during-reload", keep: "new-setting" });
		expect(result).toMatchObject({ revision: "changed-during-reload", nginx_online: !failReload });
	});
});
