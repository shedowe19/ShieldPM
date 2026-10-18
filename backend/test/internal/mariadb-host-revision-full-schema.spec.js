import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import knex from "knex";
import { Model } from "objection";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, directory: null }));
vi.mock("../../db.js", () => ({ default: () => state.db }));
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => false,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/nginx.js", () => ({
	default: { getConfigName: (_type, id) => path.join(state.directory, `${id}.conf`) },
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));

import { captureHostState, restoreHostState } from "../../internal/host-revisions.js";
import { runMigrations } from "../../migrate.js";
import { backendSourcePath } from "../helpers/source-path.js";

const suite = process.env.SHIELDPM_TEST_MARIADB === "1" ? describe : describe.skip;
const connection = {
	host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
	port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
	user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
	password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
};

suite("MariaDB host revisions with every production migration", () => {
	const databaseName = `shieldpm_snapshot_${randomUUID().replaceAll("-", "")}`;
	let admin;
	let restoreQuery;
	beforeAll(async () => {
		admin = knex({ client: "mysql2", connection });
		await admin.raw("CREATE DATABASE ??", [databaseName]);
		state.db = knex({
			client: "mysql2",
			connection: { ...connection, database: databaseName },
			pool: {
				min: 0,
				max: 4,
				afterCreate(session, callback) {
					session.query("SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE'", (error) => {
						if (error) return callback(error, session);
						session.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ", (isolationError) => {
							if (isolationError) return callback(isolationError, session);
							session.query("SET SESSION innodb_snapshot_isolation=ON", (snapshotError) =>
								callback(snapshotError, session),
							);
						});
					});
				},
			},
		});
		Model.knex(state.db);
		state.directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-full-snapshot-"));
		const migrationDirectory = path.join(state.directory, "migrations");
		await fs.mkdir(migrationDirectory);
		await fs.mkdir(path.join(state.directory, "internal"));
		await fs.mkdir(path.join(state.directory, "lib"));
		await fs.symlink(backendSourcePath("node_modules"), path.join(state.directory, "node_modules"), "dir");
		await fs.copyFile(
			backendSourcePath("lib", "host-domain-claim-key.js"),
			path.join(state.directory, "lib", "host-domain-claim-key.js"),
		);
		await fs.writeFile(
			path.join(state.directory, "logger.js"),
			"export const migrate = { info() {}, warn() {} };\n",
		);
		await fs.writeFile(
			path.join(state.directory, "internal", "nginx.js"),
			"export default { deleteConfig: async () => true, generateConfig: async () => true, reload: async () => true, test: async () => true };\n",
		);
		for (const name of (await fs.readdir(backendSourcePath("migrations"))).filter((name) => name.endsWith(".js")))
			await fs.copyFile(backendSourcePath("migrations", name), path.join(migrationDirectory, name));
		await runMigrations(state.db, migrationDirectory);
	}, 60_000);
	afterEach(() => {
		restoreQuery?.();
		restoreQuery = null;
	});

	afterAll(async () => {
		await state.db?.destroy();
		if (admin) {
			await admin.raw("DROP DATABASE IF EXISTS ??", [databaseName]);
			await admin.destroy();
		}
		if (state.directory) await fs.rm(state.directory, { force: true, recursive: true });
	});

	const fixture = async (id) => {
		const domains = [`cdn${id}.example.test`, `${String(id).repeat(56)}.onion`];
		await state.db("proxy_host").insert({
			id,
			owner_user_id: 1,
			created_on: "2026-05-11 07:26:50",
			modified_on: "2026-05-11 07:26:50",
			git_last_sync: "2026-10-18 14:37:22",
			maintenance_start: "2026-10-25 02:30:00",
			maintenance_end: "2026-10-25 04:30:00",
			forward_scheme: "http",
			forward_host: "10.0.17.7",
			forward_port: 8096,
			meta: JSON.stringify({ nginx_online: true, letsencrypt_agree: false, dns_challenge: false }),
			locations: JSON.stringify([
				{ path: "/library", forward_scheme: "http", forward_host: "10.0.17.7", forward_port: 8096 },
			]),
			domain_names: JSON.stringify(domains),
			advanced_config: "# captured directives\n",
			note: "All migrated columns are read and restored",
		});
		for (const domain of domains) await state.db("host_domain").insert({ proxy_host_id: id, domain_name: domain });
		const configPath = path.join(state.directory, `${id}.conf`);
		await fs.writeFile(configPath, "# accepted configuration\n", { mode: 0o640 });
		const originalHost = await state.db("proxy_host").where("id", id).first();
		const originalDomains = await state.db("host_domain").where("proxy_host_id", id).orderBy("id");
		const snapshot = await captureHostState(id);
		await state.db("proxy_host").where("id", id).update({ forward_host: "127.0.0.1", forward_port: 1 });
		await fs.writeFile(configPath, "# rejected configuration\n");
		return { originalHost, originalDomains, snapshot, configPath };
	};
	/** Commit a real competing write after the claim reads have established the transaction snapshot. */
	const interceptPatch = (id, conflicts = 0, permanent = false) => {
		const clientPrototype = Object.getPrototypeOf(state.db.client);
		const originalQuery = clientPrototype._query;
		let attempts = 0;
		const errors = [];
		clientPrototype._query = async function (session, query) {
			const patch = /^update `proxy_host` set /i.test(query.sql) && query.sql.includes("where `proxy_host`.`id`");
			let actualQuery = query;
			if (patch) {
				attempts++;
				if (attempts <= conflicts)
					await state
						.db("proxy_host")
						.where("id", id)
						.update({
							meta: JSON.stringify({ concurrent_status: attempts }),
						});
				if (permanent)
					actualQuery = { ...query, sql: query.sql.replace("`note` =", "`missing_fixture_column` =") };
			}
			try {
				return await originalQuery.call(this, session, actualQuery);
			} catch (error) {
				if (patch) errors.push(error);
				throw error;
			}
		};
		restoreQuery = () => {
			clientPrototype._query = originalQuery;
		};
		return { errors, attempts: () => attempts };
	};

	it.each([0, 1])(
		"restores every real column and both domain kinds after %s concurrent status writes",
		async (conflicts) => {
			const id = conflicts + 7;
			const { originalHost, originalDomains, snapshot, configPath } = await fixture(id);
			const race = interceptPatch(id, conflicts);
			await restoreHostState(snapshot);
			expect(race.attempts()).toBe(conflicts + 1);
			expect(race.errors).toMatchObject(
				Array.from({ length: conflicts }, () => ({ code: "ER_CHECKREAD", errno: 1020 })),
			);
			expect(await state.db("proxy_host").where("id", id).first()).toEqual(originalHost);
			expect(await state.db("host_domain").where("proxy_host_id", id).orderBy("id")).toEqual(originalDomains);
			expect(await fs.readFile(configPath, "utf8")).toBe("# accepted configuration\n");
			expect((await fs.stat(configPath)).mode & 0o777).toBe(0o640);
		},
	);

	it.each([
		["recurring snapshot conflicts", 3, false, "ER_CHECKREAD", 1020],
		["permanent missing-column error", 0, true, "ER_BAD_FIELD_ERROR", 1054],
	])(
		"bounds %s without committing partial database or file restoration",
		async (_name, conflicts, permanent, code, errno) => {
			const id = permanent ? 10 : 9;
			const { originalDomains, snapshot, configPath } = await fixture(id);
			const beforeHost = await state.db("proxy_host").where("id", id).first();
			const registry = ["host_domain_claim", "host_domain_claim_owner", "host_domain_claim_lock"];
			const readRegistry = () =>
				Promise.all(registry.map((table, index) => state.db(table).orderBy(index === 2 ? "id" : "domain_key")));
			const beforeRegistry = await readRegistry();
			const race = interceptPatch(id, conflicts, permanent);
			let rejected;
			try {
				await restoreHostState(snapshot);
			} catch (error) {
				rejected = error;
			}
			expect(rejected).toMatchObject({ nativeError: { code, errno } });
			expect(rejected.nativeError).toBe(race.errors.at(-1));
			expect(race.attempts()).toBe(permanent ? 1 : 3);
			expect(race.errors).toHaveLength(permanent ? 1 : 3);
			expect(await state.db("proxy_host").where("id", id).first()).toEqual({
				...beforeHost,
				...(permanent ? {} : { meta: { concurrent_status: 3 } }),
			});
			expect(await state.db("host_domain").where("proxy_host_id", id).orderBy("id")).toEqual(originalDomains);
			expect(await readRegistry()).toEqual(beforeRegistry);
			expect(await fs.readFile(configPath, "utf8")).toBe("# rejected configuration\n");
			expect((await fs.stat(configPath)).mode & 0o777).toBe(0o640);
		},
	);
});
