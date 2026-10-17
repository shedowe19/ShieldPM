import http from "node:http";
import knex from "knex";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, databaseName: null, alerts: vi.fn() }));
const shouldRunMariaDb = process.env.SHIELDPM_TEST_MARIADB === "1";
vi.mock("../../db.js", async () => {
	const { default: createKnex } = await import("knex");
	const { randomUUID } = await import("node:crypto");
	state.databaseName = `shieldpm_monitor_${randomUUID().replaceAll("-", "")}`;
	// Models bind at import time; no connection is acquired before the database exists.
	state.db = createKnex({
		client: "mysql2",
		connection: {
			host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
			password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
			port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
			user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
			database: state.databaseName,
		},
		pool: {
			min: 0,
			max: 2,
			afterCreate(session, done) {
				session.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ", (error) => {
					if (error) return done(error, session);
					session.query("SET SESSION innodb_snapshot_isolation=ON", (snapshotError) =>
						done(snapshotError, session),
					);
				});
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
vi.mock("../../internal/chat.js", () => ({ default: { sendHostMonitorAlert: state.alerts } }));

import monitor, { pruneHistory } from "../../internal/proxy-host-monitor.js";
import { up as addMonitor } from "../../migrations/20260923000000_add_proxy_host_monitor.js";
import { up as addTls } from "../../migrations/20260923000001_add_proxy_host_monitor_tls_options.js";
import { up as addSkipTls } from "../../migrations/20260924000000_add_proxy_host_monitor_skip_certificate_verification.js";
import { up as addIncidents } from "../../migrations/20261017190300_incident_center.js";

const connection = {
	host: process.env.SHIELDPM_TEST_MARIADB_HOST || "127.0.0.1",
	password: process.env.SHIELDPM_TEST_MARIADB_PASSWORD || "",
	port: Number(process.env.SHIELDPM_TEST_MARIADB_PORT || 3306),
	user: process.env.SHIELDPM_TEST_MARIADB_USER || "root",
};
const mariaDb = shouldRunMariaDb ? describe : describe.skip;
const hostId = 11;
let admin;
let competitor;
let databaseName;
let server;
let requests = 0;
let restoreQuery;

/** Pause the actual DELETE at the driver boundary; the second connection commits a real competing write. */
function conflictOnHistoryDelete(conflicts = 1) {
	// Knex creates transaction clients from the dialect prototype, rather than the pool client instance.
	const clientPrototype = Object.getPrototypeOf(state.db.client);
	const originalQuery = clientPrototype._query;
	const errors = [];
	const transactionConnections = [];
	let deletes = 0;
	clientPrototype._query = async function (session, query) {
		if (/^delete from `proxy_host_monitor_check`/i.test(query.sql)) {
			deletes++;
			transactionConnections.push(session.threadId);
			if (deletes <= conflicts) {
				await competitor("proxy_host_monitor_check")
					.where({ id: 1, host_id: hostId })
					.update({
						checked_at: new Date(Date.now() - 31 * 86_400_000 + deletes * 1000).toISOString(),
						message: `Committed competing writer ${deletes}`,
					});
			}
		}
		try {
			return await originalQuery.call(this, session, query);
		} catch (error) {
			if (/^delete from `proxy_host_monitor_check`/i.test(query.sql)) errors.push(error);
			throw error;
		}
	};
	restoreQuery = () => {
		clientPrototype._query = originalQuery;
	};
	return { errors, transactionConnections, deletes: () => deletes };
}

mariaDb("MariaDB monitor history snapshot conflicts", () => {
	beforeAll(async () => {
		admin = knex({ client: "mysql2", connection });
		databaseName = state.databaseName;
		await admin.raw("CREATE DATABASE ??", [databaseName]);
		competitor = knex({
			client: "mysql2",
			connection: { ...connection, database: databaseName },
			pool: { min: 0, max: 1 },
		});
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.integer("is_deleted").notNullable().defaultTo(0);
			table.integer("enabled").notNullable().defaultTo(1);
			table.integer("owner_user_id");
			table.string("forward_scheme");
			table.string("forward_host");
			table.integer("forward_port");
			table.text("meta");
		});
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
		});
		await addMonitor(state.db);
		await addTls(state.db);
		await addSkipTls(state.db);
		await addIncidents(state.db);
		server = http.createServer((_request, response) => {
			requests++;
			response.writeHead(503).end();
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	});

	beforeEach(async () => {
		monitor.stop();
		state.alerts.mockClear();
		requests = 0;
		for (const table of [
			"notification_delivery",
			"notification_target",
			"monitor_incident",
			"monitor_observation",
			"monitor_daily",
			"monitor_latency",
			"monitor_mute",
			"proxy_host_monitor_check",
			"proxy_host_monitor",
			"host_domain",
			"proxy_host",
		])
			await state.db(table).delete();
		const now = new Date().toISOString();
		const expired = new Date(Date.now() - 31 * 86_400_000).toISOString();
		await state.db("proxy_host").insert({
			id: hostId,
			owner_user_id: 7,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: server.address().port,
			meta: "{}",
		});
		await state.db("host_domain").insert({ proxy_host_id: hostId, domain_name: "monitor.example.test" });
		await state.db("proxy_host_monitor").insert({
			host_id: hostId,
			enabled: 1,
			alert_enabled: 1,
			state: "up",
			created_on: now,
			modified_on: now,
		});
		await state.db("notification_target").insert({
			owner_user_id: 7,
			name: "Regression outbox",
			type: "webhook",
			host_ids: "[]",
			secret: "Unused: no delivery worker is started",
			created_on: now,
			modified_on: now,
		});
		await state.db("proxy_host_monitor_check").insert([
			{ id: 1, host_id: hostId, state: "up", checked_at: expired },
			...Array.from({ length: 100 }, (_, index) => ({
				id: index + 2,
				host_id: hostId,
				state: "up",
				checked_at: now,
			})),
			{ id: 102, host_id: 12, state: "up", checked_at: expired },
		]);
		const [[settings]] = await state.db.raw(
			"SELECT @@SESSION.innodb_snapshot_isolation AS snapshot_isolation, @@SESSION.tx_isolation AS isolation_level",
		);
		expect(Number(settings.snapshot_isolation)).toBe(1);
		expect(settings.isolation_level).toBe("REPEATABLE-READ");
	});

	afterEach(() => {
		restoreQuery?.();
		restoreQuery = null;
	});

	afterAll(async () => {
		monitor.stop();
		if (server) await new Promise((resolve) => server.close(resolve));
		await state.db.destroy();
		await competitor?.destroy();
		if (databaseName) await admin.raw("DROP DATABASE IF EXISTS ??", [databaseName]);
		await admin?.destroy();
	});

	it("reproduces errno 1020 on the real pruning DELETE and proves the whole transaction rolls back", async () => {
		const conflict = conflictOnHistoryDelete();
		await expect(
			state.db.transaction(async (trx) => {
				await trx("proxy_host_monitor_check").where({ id: 1 }).first();
				await trx("proxy_host_monitor").where({ host_id: hostId }).update({ state: "down" });
				await trx("proxy_host_monitor_check").insert({
					host_id: hostId,
					checked_at: new Date().toISOString(),
					state: "down",
				});
				await pruneHistory(hostId, trx);
			}),
		).rejects.toMatchObject({ nativeError: { code: "ER_CHECKREAD", errno: 1020 } });
		expect(conflict.errors).toHaveLength(1);
		expect(await state.db("proxy_host_monitor").where({ host_id: hostId }).first()).toMatchObject({ state: "up" });
		expect(await state.db("proxy_host_monitor_check").where({ host_id: hostId })).toHaveLength(101);
		expect(await state.db("proxy_host_monitor_check").where({ state: "down" })).toHaveLength(0);
	});

	it("retries the production transaction on a fresh snapshot without repeating probes, alerts or outbox events", async () => {
		const conflict = conflictOnHistoryDelete();
		await expect(monitor.run(hostId)).resolves.toMatchObject({ state: "down", status_code: 503, transition: true });
		expect(conflict.errors).toMatchObject([{ code: "ER_CHECKREAD", errno: 1020 }]);
		expect(conflict.deletes()).toBe(2);
		const [[{ connection_id: competitorId }]] = await competitor.raw("SELECT CONNECTION_ID() AS connection_id");
		expect(conflict.transactionConnections.every((id) => id !== competitorId)).toBe(true);
		expect(requests).toBe(1);
		expect(state.alerts).toHaveBeenCalledTimes(1);
		expect(await state.db("proxy_host_monitor_check").where({ host_id: hostId })).toHaveLength(100);
		expect(await state.db("proxy_host_monitor_check").where({ host_id: hostId, state: "down" })).toHaveLength(1);
		expect(await state.db("proxy_host_monitor_check").where({ host_id: 12 })).toHaveLength(1);
		expect(await state.db("monitor_incident")).toMatchObject([{ host_id: hostId, failure_count: 1 }]);
		expect(await state.db("monitor_observation")).toMatchObject([{ host_id: hostId, state: "down" }]);
		expect(await state.db("monitor_daily")).toMatchObject([{ host_id: hostId, checks: 1 }]);
		expect(await state.db("notification_delivery")).toMatchObject([
			{ host_id: hostId, event: "incident.opened", status: "pending", attempts: 0 },
		]);
	});

	it("bounds real recurring conflicts to three transactions and leaves no partial result or notification", async () => {
		const conflict = conflictOnHistoryDelete(3);
		await expect(monitor.run(hostId)).rejects.toMatchObject({ nativeError: { code: "ER_CHECKREAD", errno: 1020 } });
		expect(conflict.errors).toHaveLength(3);
		expect(conflict.deletes()).toBe(3);
		expect(requests).toBe(1);
		expect(state.alerts).not.toHaveBeenCalled();
		expect(await state.db("proxy_host_monitor").where({ host_id: hostId }).first()).toMatchObject({
			state: "up",
			checked_at: null,
			last_alert_at: null,
		});
		expect(await state.db("proxy_host_monitor_check").where({ host_id: hostId })).toHaveLength(101);
		for (const table of ["monitor_incident", "monitor_observation", "monitor_daily", "notification_delivery"])
			expect(await state.db(table)).toHaveLength(0);
	});
});
