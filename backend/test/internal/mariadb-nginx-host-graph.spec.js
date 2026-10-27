import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, databaseName: null }));
vi.mock("../../db.js", async () => {
	const { default: createKnex } = await import("knex");
	const { randomUUID: uuid } = await import("node:crypto");
	state.databaseName = `shieldpm_nginx_${uuid().replaceAll("-", "")}`;
	state.db = createKnex({
		client: "mysql2",
		connection: {
			host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
			port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
			user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
			password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
			database: state.databaseName,
		},
		pool: { min: 0, max: 4 },
	});
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => false,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/anubis.js", () => ({ default: { generatePolicy: async () => {} } }));
vi.mock("../../lib/terminal-access.js", () => ({ getTerminalAccessToken: () => "test-token" }));
vi.mock("../../lib/firewall-geoip.js", async (original) => ({
	...(await original()),
	assertConfiguredFirewallLookups: async () => {},
}));

import nginx from "../../internal/nginx.js";
import utils from "../../lib/utils.js";
import ProxyHost from "../../models/proxy_host.js";

const suite = process.env.SHIELDPM_TEST_MARIADB === "1" ? describe : describe.skip;
const tables = ["host_domain", "proxy_host", "certificate", "access_list", "access_list_auth", "access_list_client"];
const graph = "[host_domains,certificate,access_list.[clients,items]]";
const host = (id) => ProxyHost.query().findById(id).withGraphFetched(graph);

suite("MariaDB current Nginx render graphs and accepted status", () => {
	let admin;
	let directory;
	beforeAll(async () => {
		admin = knex({
			client: "mysql2",
			connection: { ...state.db.client.config.connection, database: undefined },
		});
		await admin.raw("CREATE DATABASE ??", [state.databaseName]);
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			for (const column of ["forward_host", "forward_scheme", "domain_names", "meta", "locations"])
				table.text(column);
			for (const column of ["forward_port", "certificate_id", "access_list_id", "is_deleted"])
				table.integer(column).defaultTo(0);
			table.integer("enabled").defaultTo(1);
			table.dateTime("modified_on");
		});
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
		});
		for (const name of ["certificate", "access_list"])
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("is_deleted").defaultTo(0);
				table.text("meta");
				table.text("provider");
				for (const column of ["created_on", "modified_on", "expires_on"]) table.dateTime(column);
			});
		for (const name of ["access_list_auth", "access_list_client"])
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("access_list_id");
				table.text("username");
			});
	});
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), `shieldpm-nginx-${randomUUID()}-`));
		vi.stubEnv("DISABLE_NGINX_BEAUTIFIER", "true");
		vi.stubEnv("DATA_PATH", directory);
		vi.spyOn(nginx, "getConfigName").mockImplementation((_kind, id) => path.join(directory, `${id}.conf`));
		vi.spyOn(utils, "execFile").mockResolvedValue("");
		for (const table of tables) await state.db(table).delete();
		await state.db("proxy_host").insert(
			[7, 8].map((id) => ({
				id,
				forward_scheme: "http",
				forward_host: "127.0.0.1",
				forward_port: 8080,
				meta: JSON.stringify({ nginx_online: false, marker: `host-${id}` }),
			})),
		);
		await state.db("host_domain").insert([
			{ proxy_host_id: 7, domain_name: "manual.example.test" },
			{ proxy_host_id: 8, domain_name: "docker.example.test" },
		]);
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});
	afterAll(async () => {
		await state.db.destroy();
		if (admin) {
			await admin.raw("DROP DATABASE IF EXISTS ??", [state.databaseName]);
			await admin.destroy();
		}
	});

	it("preserves manual host domains, certificate dates and ACL children through singleton joins", async () => {
		await state.db("certificate").insert({
			id: 3,
			provider: "custom",
			meta: "{}",
			created_on: "2026-05-11 07:26:50",
			expires_on: "2026-12-17 23:59:59",
		});
		await state.db("access_list").insert({ id: 4, meta: "{}", created_on: "2026-05-11 07:26:50" });
		await state.db("access_list_auth").insert({ access_list_id: 4, username: "manual-user" });
		await state.db("access_list_client").insert({ access_list_id: 4, username: "manual-client" });
		await state.db("proxy_host").where({ id: 7 }).update({ certificate_id: 3, access_list_id: 4 });
		const expected = await host(7);
		const current = await nginx.getCurrentHost(ProxyHost, "proxy_host", 7);
		expect(current.toJSON()).toEqual(expected.toJSON());
		expect(current.domain_names).toEqual(["manual.example.test"]);
		expect(current.certificate.expires_on).toBeInstanceOf(Date);
		const rendered = await nginx.renderConfig("proxy_host", current);
		expect(rendered).toContain("server_name manual.example.test;");
		expect(rendered).toContain("/data/tls/custom/npm-3/fullchain.pem");
		expect(rendered).toContain(`auth_basic_user_file  ${directory}/access/4;`);
	});

	it("updates both manual and discovered accepted statuses without writing fetched certificate or ACL rows", async () => {
		await state
			.db("proxy_host")
			.where({ id: 8 })
			.update({ meta: JSON.stringify({ docker_container_id: "fixture" }) });
		const writes = [];
		const capture = (query) => {
			if (/^(update|insert|delete)\b/i.test(query.sql)) writes.push(query.sql);
		};
		state.db.on("query", capture);
		try {
			await nginx.bulkGenerateConfigs(ProxyHost, "proxy_host", [{ id: 7 }, { id: 8 }]);
		} finally {
			state.db.removeListener("query", capture);
		}
		for (const id of [7, 8]) expect((await host(id)).meta).toMatchObject({ nginx_online: true, nginx_err: null });
		expect((await host(8)).meta.docker_container_id).toBe("fixture");
		expect(writes).toHaveLength(2);
		expect(writes.every((sql) => /^update `proxy_host` set `meta` = \?, `modified_on` = NOW\(\)/.test(sql))).toBe(
			true,
		);
	});
});
