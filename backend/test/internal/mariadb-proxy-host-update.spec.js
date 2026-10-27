import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, databaseName: null, directory: null, configure: vi.fn() }));
vi.mock("../../db.js", async () => {
	const { default: createKnex } = await import("knex");
	const { randomUUID } = await import("node:crypto");
	state.databaseName = `shieldpm_host_update_${randomUUID().replaceAll("-", "")}`;
	state.db = createKnex({
		client: "mysql2",
		connection: {
			host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
			port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
			user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
			password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
			database: state.databaseName,
		},
		pool: {
			min: 0,
			max: 4,
			afterCreate(session, callback) {
				session.query("SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE'", (error) =>
					callback(error, session),
				);
			},
		},
	});
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => false,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/nginx.js", () => ({
	default: {
		withConfigurationLock: (callback) => callback(),
		getConfigName: (_type, id) => `${state.directory}/${id}.conf`,
		configureHost: state.configure,
		reload: vi.fn(),
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../internal/git-deploy.js", () => ({
	default: { startPollingForHost: vi.fn(), stopPolling: vi.fn() },
}));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: { start: vi.fn(), stop: vi.fn() } }));
vi.mock("../../internal/proxy-host-monitor.js", () => ({ default: { resetHost: vi.fn() } }));
vi.mock("../../internal/certificate.js", () => ({ default: { get: vi.fn(), createQuickCertificate: vi.fn() } }));

import certificates from "../../internal/certificate.js";
import revisions from "../../internal/host-revisions.js";
import nginx from "../../internal/nginx.js";
import proxyHosts from "../../internal/proxy-host.js";
import * as policies from "../../internal/proxy-host-policies.js";
import { decrypt } from "../../lib/encryption.js";
import { up as addClaims } from "../../migrations/20261017190200_add_host_domain_claims.js";
import { up as addRevisions } from "../../migrations/20261017190500_host_revisions.js";

const suite = process.env.SHIELDPM_TEST_MARIADB === "1" ? describe : describe.skip;
const access = { can: vi.fn().mockResolvedValue({ permission_visibility: "all" }), token: { getUserId: () => 1 } };
const oldDate = "2026-05-11 07:26:50";
const sharedTables = ["certificate", "access_list", "access_list_auth", "access_list_client", "user"];
const allTables = [
	"proxy_host_revision",
	"host_domain_claim_owner",
	"host_domain_claim",
	"host_domain",
	"proxy_host",
	...sharedTables,
];

suite("MariaDB manual proxy-host service updates", () => {
	let admin;
	beforeAll(async () => {
		admin = knex({ client: "mysql2", connection: { ...state.db.client.config.connection, database: undefined } });
		await admin.raw("CREATE DATABASE ??", [state.databaseName]);
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			for (const field of ["created_on", "modified_on"]) table.dateTime(field).notNullable();
			for (const field of ["git_last_sync", "maintenance_start", "maintenance_end"]) table.dateTime(field);
			for (const field of ["meta", "locations", "domain_names", "anubis_rules"]) table.text(field);
			for (const field of [
				"forward_host",
				"forward_scheme",
				"advanced_config",
				"note",
				"git_credentials",
				"terminal_password",
				"terminal_private_key",
			])
				table.text(field);
			for (const field of [
				"owner_user_id",
				"forward_port",
				"certificate_id",
				"access_list_id",
				"is_deleted",
				"ssl_forced",
				"hsts_enabled",
				"hsts_subdomains",
			])
				table.integer(field).defaultTo(0);
			table.integer("enabled").defaultTo(1);
		});
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
			for (const field of ["created_on", "modified_on"]) table.dateTime(field).notNullable();
		});
		for (const name of sharedTables)
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				for (const field of ["created_on", "modified_on"]) table.dateTime(field).notNullable();
				table.integer("is_deleted").defaultTo(0);
				table.text("meta");
				if (name === "certificate") {
					table.string("provider");
					table.string("nice_name");
					table.text("domain_names");
					table.dateTime("expires_on").notNullable();
				}
				if (name === "access_list") table.string("name");
				if (name === "access_list_auth") {
					table.integer("access_list_id");
					table.string("username");
					table.string("password");
				}
				if (name === "access_list_client") {
					table.integer("access_list_id");
					table.string("address");
					table.string("directive");
				}
			});
		for (const name of ["redirection_host", "dead_host"])
			await state.db.schema.createTable(name, (table) => {
				table.increments("id");
				table.integer("is_deleted");
				table.text("domain_names");
			});
		await addClaims(state.db);
		await addRevisions(state.db);
	});
	beforeEach(async () => {
		state.directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-host-update-"));
		vi.stubEnv("DATA_PATH", state.directory);
		vi.clearAllMocks();
		for (const table of allTables) await state.db(table).delete();
		await state.db("proxy_host").insert({
			id: 7,
			owner_user_id: 1,
			created_on: oldDate,
			modified_on: oldDate,
			git_last_sync: oldDate,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: 8080,
			certificate_id: 3,
			access_list_id: 4,
			ssl_forced: 1,
			hsts_enabled: 1,
			hsts_subdomains: 1,
			meta: "{}",
			locations: "[]",
			domain_names: '["manual.example.test"]',
			git_credentials: "original-git-ciphertext",
			terminal_password: "original-password-ciphertext",
			terminal_private_key: "original-private-key-ciphertext",
		});
		await state.db("host_domain").insert({
			proxy_host_id: 7,
			domain_name: "manual.example.test",
			created_on: oldDate,
			modified_on: oldDate,
		});
		for (const [table, row] of [
			["user", { id: 1 }],
			[
				"certificate",
				{
					id: 3,
					provider: "other",
					nice_name: "Shared certificate",
					expires_on: "2026-12-17 23:59:59",
					domain_names: "[]",
				},
			],
			["access_list", { id: 4, name: "Shared ACL" }],
			["access_list_auth", { id: 5, access_list_id: 4, username: "fixture", password: "existing-hash" }],
			["access_list_client", { id: 6, access_list_id: 4, address: "127.0.0.1", directive: "allow" }],
		])
			await state.db(table).insert({ ...row, created_on: oldDate, modified_on: oldDate, meta: "{}" });
		state.configure.mockImplementation(async (model, _type, row) => {
			const meta = { ...row.meta, nginx_online: true, nginx_err: null };
			await model.query().findById(row.id).patch({ meta });
			return meta;
		});
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		if (state.directory) await fs.rm(state.directory, { recursive: true, force: true });
	});
	afterAll(async () => {
		await state.db.destroy();
		if (admin) {
			await admin.raw("DROP DATABASE IF EXISTS ??", [state.databaseName]);
			await admin.destroy();
		}
	});

	it("updates a manually configured host without writing its fetched certificate, ACL or creation timestamps", async () => {
		const before = Object.fromEntries(
			await Promise.all(sharedTables.map(async (table) => [table, await state.db(table)])),
		);
		const createdOn = (await state.db("proxy_host").where("id", 7).first()).created_on;
		const writes = [];
		const capture = ({ sql }) => {
			if (/^(update|insert|delete)\b/i.test(sql)) writes.push(sql);
		};
		state.db.on("query", capture);
		let updated;
		try {
			updated = await proxyHosts.update(access, { id: 7, note: "Manual edit" });
		} finally {
			state.db.off("query", capture);
		}
		expect(updated.note).toBe("Manual edit");
		expect(updated.domain_names).toEqual(["manual.example.test"]);
		expect(updated.meta.nginx_online).toBe(true);
		expect((await state.db("proxy_host").where("id", 7).first()).created_on).toEqual(createdOn);
		for (const table of sharedTables) {
			expect(await state.db(table)).toEqual(before[table]);
			expect(
				writes.filter((sql) =>
					new RegExp(`^(update|insert into|delete from) \\x60${table}\\x60`, "i").test(sql),
				),
			).toEqual([]);
		}
		const revision = await state.db("proxy_host_revision").where({ host_id: 7, action: "updated" }).first();
		const snapshot = JSON.parse(decrypt(revision.encrypted_snapshot));
		expect(snapshot.host.certificate.nice_name).toBe("Shared certificate");
		expect(snapshot.host.access_list.items[0].password).toBe("existing-hash");
	});

	it("preserves shared certificate and ACL edits committed after the rollback snapshot was captured", async () => {
		const prepare = policies.prepareProxyHostPolicies;
		vi.spyOn(policies, "prepareProxyHostPolicies").mockImplementation(async (...args) => {
			await state
				.db("certificate")
				.where("id", 3)
				.update({ nice_name: "Rotated shared certificate", meta: '{"rotation":2}' });
			await state.db("access_list").where("id", 4).update({ name: "Edited shared ACL", meta: '{"revision":2}' });
			await state.db("access_list_auth").where("id", 5).update({ password: "rotated-shared-hash" });
			await state.db("access_list_client").where("id", 6).update({ address: "192.0.2.44", directive: "deny" });
			await prepare(...args);
		});
		await proxyHosts.update(access, { id: 7, note: "Host-only edit" });
		expect((await state.db("certificate").where("id", 3).first()).nice_name).toBe("Rotated shared certificate");
		expect((await state.db("access_list").where("id", 4).first()).name).toBe("Edited shared ACL");
		expect((await state.db("access_list_auth").where("id", 5).first()).password).toBe("rotated-shared-hash");
		expect(await state.db("access_list_client").where("id", 6).first()).toMatchObject({
			address: "192.0.2.44",
			directive: "deny",
		});
	});

	it.each([undefined, ""])(
		"preserves omitted host values and credentials (%s) changed while waiting for the config queue",
		async (credential) => {
			vi.spyOn(nginx, "withConfigurationLock").mockImplementation(async (callback) => {
				await state.db("proxy_host").where("id", 7).update({
					forward_port: 9090,
					certificate_id: 0,
					git_credentials: "rotated-git-ciphertext",
					terminal_password: "rotated-password-ciphertext",
					terminal_private_key: "rotated-private-key-ciphertext",
				});
				return callback();
			});
			await proxyHosts.update(access, {
				id: 7,
				note: "Queued partial update",
				...(credential === undefined
					? {}
					: {
							git_credentials: credential,
							terminal_password: credential,
							terminal_private_key: credential,
						}),
			});
			expect(await state.db("proxy_host").where("id", 7).first()).toMatchObject({
				forward_port: 9090,
				certificate_id: 0,
				ssl_forced: 0,
				hsts_enabled: 0,
				hsts_subdomains: 0,
				git_credentials: "rotated-git-ciphertext",
				terminal_password: "rotated-password-ciphertext",
				terminal_private_key: "rotated-private-key-ciphertext",
			});
		},
	);

	it("retains deliberate domain, SSL and credential changes while ignoring server-owned graph fields", async () => {
		await proxyHosts.update(access, {
			id: 7,
			domain_names: ["changed.example.test", "alias.example.test"],
			certificate_id: 0,
			ssl_forced: true,
			hsts_enabled: true,
			hsts_subdomains: true,
			git_credentials: "new-fixture-git-token",
			terminal_password: "new-fixture-password",
			terminal_private_key: "new-fixture-private-key",
			created_on: "2000-01-01T00:00:00.000Z",
			owner_user_id: 99,
			certificate: { id: 3, nice_name: "Unexpected overwrite" },
			access_list: { id: 4, name: "Unexpected overwrite" },
			host_domains: [{ id: 999, domain_name: "unexpected.example.test" }],
		});
		const row = await state.db("proxy_host").where("id", 7).first();
		expect(row).toMatchObject({
			owner_user_id: 1,
			certificate_id: 0,
			ssl_forced: 0,
			hsts_enabled: 0,
			hsts_subdomains: 0,
		});
		expect(decrypt(row.git_credentials)).toBe("new-fixture-git-token");
		expect(decrypt(row.terminal_password)).toBe("new-fixture-password");
		expect(decrypt(row.terminal_private_key)).toBe("new-fixture-private-key");
		expect(row.created_on.getFullYear()).toBe(2026);
		expect(
			(await state.db("host_domain").where("proxy_host_id", 7).orderBy("id")).map((domain) => domain.domain_name),
		).toEqual(["changed.example.test", "alias.example.test"]);
		expect((await state.db("certificate").where("id", 3).first()).nice_name).toBe("Shared certificate");
		expect((await state.db("access_list").where("id", 4).first()).name).toBe("Shared ACL");
	});

	it("persists the newly issued certificate ID and preserves explicitly requested SSL settings", async () => {
		await state.db("certificate").insert({
			id: 9,
			provider: "other",
			nice_name: "Newly issued",
			expires_on: "2027-01-01 23:59:59",
			created_on: oldDate,
			modified_on: oldDate,
			meta: "{}",
			domain_names: "[]",
		});
		vi.mocked(certificates.createQuickCertificate).mockResolvedValue({ id: 9 });
		const updated = await proxyHosts.update(access, {
			id: 7,
			certificate_id: "new",
			ssl_forced: true,
			hsts_enabled: true,
			hsts_subdomains: false,
		});
		expect(updated).toMatchObject({
			certificate_id: 9,
			ssl_forced: true,
			hsts_enabled: true,
			hsts_subdomains: false,
		});
		expect(certificates.createQuickCertificate).toHaveBeenCalledTimes(1);
		expect(await state.db("proxy_host").where("id", 7).first()).toMatchObject({
			certificate_id: 9,
			ssl_forced: 1,
			hsts_enabled: 1,
			hsts_subdomains: 0,
		});
	});

	it.each([
		["local", false],
		["+02:00", false],
		["-03:30", false],
		["Z", true],
	])(
		"restores failed activation without changing shared resources (timezone=%s, dateStrings=%s)",
		async (timezone, dateStrings) => {
			vi.stubEnv("TZ", "Europe/Berlin");
			const initialDatabase = state.db;
			const database = knex({
				client: "mysql2",
				connection: { ...initialDatabase.client.config.connection, timezone, dateStrings },
				pool: { min: 0, max: 4 },
			});
			state.db = database;
			Model.knex(database);
			try {
				await state.db("proxy_host").where("id", 7).update({
					forward_host: "[2001:db8::7]",
					forward_port: 5055,
					maintenance_start: "2026-10-25 02:30:00",
					maintenance_end: "2026-10-25 04:30:00",
				});
				const configPath = path.join(state.directory, "7.conf");
				await fs.writeFile(configPath, "# accepted configuration\n", { mode: 0o640 });
				const beforeHost = await state.db("proxy_host").where("id", 7).first();
				const beforeDomains = await state.db("host_domain").where("proxy_host_id", 7);
				const beforeCertificate = await state.db("certificate").where("id", 3).first();
				const beforeAcl = await state.db("access_list").where("id", 4).first();
				state.configure.mockImplementationOnce(async (model, _kind, row) => {
					const meta = {
						...row.meta,
						nginx_online: false,
						// Preserve the exact corrupted variable from the production error.
						// codespell:ignore-next-line statu
						nginx_err: 'Startup configuration failed: nginx: [emerg] unknown "statu" variable',
					};
					await model.query().findById(row.id).patch({ meta });
					await fs.writeFile(configPath, "# rejected configuration\n");
					return meta;
				});
				await expect(
					proxyHosts.update(access, {
						id: 7,
						note: "Rejected edit",
						domain_names: ["rejected.example.test"],
					}),
				).rejects.toThrow("Host activation failed");
				expect(await state.db("proxy_host").where("id", 7).first()).toEqual(beforeHost);
				expect(await state.db("host_domain").where("proxy_host_id", 7)).toEqual(beforeDomains);
				expect(await state.db("certificate").where("id", 3).first()).toEqual(beforeCertificate);
				expect(await state.db("access_list").where("id", 4).first()).toEqual(beforeAcl);
				expect(await fs.readFile(configPath, "utf8")).toBe("# accepted configuration\n");
				expect((await fs.stat(configPath)).mode & 0o777).toBe(0o640);
				expect(nginx.reload).toHaveBeenCalledOnce();
			} finally {
				state.db = initialDatabase;
				Model.knex(initialDatabase);
				await database.destroy();
			}
		},
	);

	it("activates a saved revision containing the captured Git synchronization timestamp", async () => {
		const revision = await revisions.record(access, 7, "baseline");
		const beforeHost = await state.db("proxy_host").where("id", 7).first();
		await proxyHosts.update(access, { id: 7, note: "Later edit" });
		const plan = await revisions.plan(access, 7, revision.id);
		const restored = await revisions.restore(access, 7, revision.id, plan.expected_fingerprint);
		expect(restored.action).toBe("restored");
		expect(await state.db("proxy_host").where("id", 7).first()).toMatchObject({
			note: null,
			git_last_sync: beforeHost.git_last_sync,
		});
	});
});
