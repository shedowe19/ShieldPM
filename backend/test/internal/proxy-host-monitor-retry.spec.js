import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, alerts: vi.fn() }));
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
vi.mock("../../internal/chat.js", () => ({ default: { sendHostMonitorAlert: state.alerts } }));

import incidents from "../../internal/incidents.js";
import monitor from "../../internal/proxy-host-monitor.js";
import { up as addMonitor } from "../../migrations/20260923000000_add_proxy_host_monitor.js";
import { up as addTls } from "../../migrations/20260923000001_add_proxy_host_monitor_tls_options.js";
import { up as addTlsException } from "../../migrations/20260924000000_add_proxy_host_monitor_skip_certificate_verification.js";
import { up as addIncidents } from "../../migrations/20261017190300_incident_center.js";
import { NotificationTarget } from "../../models/monitor_incident.js";
import ProxyHostMonitor from "../../models/proxy_host_monitor.js";

const transient = (code = "ER_CHECKREAD", errno = 1020) =>
	Object.assign(new Error("Record has changed since last read in table 'proxy_host_monitor_check'"), {
		code,
		errno,
		sqlState: "HY000",
	});
let server;
let probes = 0;
const statements = [];
let failures;
const collect = ({ sql }) => {
	statements.push(sql);
	if (/^delete from [`"]proxy_host_monitor_check[`"]/i.test(sql) && failures.length) throw failures.shift();
};
const afterRollback = (change) => {
	const transact = ProxyHostMonitor.transaction.bind(ProxyHostMonitor);
	let changed = false;
	vi.spyOn(ProxyHostMonitor, "transaction").mockImplementation(async (callback) => {
		try {
			return await transact(callback);
		} catch (error) {
			if (!changed) {
				changed = true;
				await change();
			}
			throw error;
		}
	});
};

/** Fault injection exercises real SQLite rollback; only the retry classifier is presented as mysql2. */
describe("monitor persistence transaction retries", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.integer("is_deleted").defaultTo(0);
			table.integer("enabled").defaultTo(1);
			table.integer("owner_user_id");
			table.string("forward_scheme");
			table.string("forward_host");
			table.integer("forward_port");
		});
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
		});
		await addMonitor(state.db);
		await addTls(state.db);
		await addTlsException(state.db);
		await addIncidents(state.db);
		server = http.createServer((_req, res) => {
			probes++;
			res.writeHead(503).end();
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	});
	beforeEach(async () => {
		monitor.stop();
		vi.clearAllMocks();
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
			"proxy_host",
		])
			await state.db(table).delete();
		await state.db("proxy_host").insert({
			id: 11,
			owner_user_id: 7,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: server.address().port,
		});
		await ProxyHostMonitor.query().insert({ host_id: 11, enabled: true, alert_enabled: true, state: "up" });
		await NotificationTarget.query().insert({
			owner_user_id: 7,
			name: "Synthetic target",
			type: "webhook",
			enabled: true,
			host_ids: [11],
			secret: "synthetic-unused-credentials",
		});
		const checkedAt = new Date(Date.now() - 1000).toISOString();
		await state
			.db("proxy_host_monitor_check")
			.insert(Array.from({ length: 100 }, () => ({ host_id: 11, checked_at: checkedAt, state: "up" })));
		probes = 0;
		failures = [];
		statements.length = 0;
		state.db.client.config.client = "mysql2";
		state.db.on("query", collect);
	});
	afterEach(() => {
		state.db.off("query", collect);
		state.db.client.config.client = "better-sqlite3";
		vi.restoreAllMocks();
	});
	afterAll(async () => {
		monitor.stop();
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
		await state.db.destroy();
	});

	it.each([
		["ER_CHECKREAD", 1020, false],
		["ER_CHECKREAD", 1020, true],
		["ER_LOCK_WAIT_TIMEOUT", 1205, false],
		["ER_LOCK_DEADLOCK", 1213, false],
	])(
		"retries %s/%s (wrapped=%s) in a fresh transaction without repeating probe or alerts",
		async (code, errno, wrapped) => {
			const error = transient(code, errno);
			failures.push(wrapped ? Object.assign(new Error("Objection DBError"), { nativeError: error }) : error);
			expect(await monitor.run(11)).toMatchObject({ state: "down", status_code: 503 });
			expect(probes).toBe(1);
			expect(state.alerts).toHaveBeenCalledTimes(1);
			expect(statements.filter((sql) => /^BEGIN/i.test(sql))).toHaveLength(2);
			expect(statements.filter((sql) => /^ROLLBACK/i.test(sql))).toHaveLength(1);
			expect(statements.filter((sql) => /^COMMIT/i.test(sql))).toHaveLength(1);
			expect(await state.db("proxy_host_monitor_check").where("host_id", 11)).toHaveLength(100);
			expect(await state.db("proxy_host_monitor_check").where({ host_id: 11, state: "down" })).toHaveLength(1);
			expect(await state.db("monitor_incident")).toHaveLength(1);
			expect((await state.db("monitor_daily").first()).checks).toBe(1);
			expect(await state.db("notification_delivery")).toHaveLength(1);
		},
	);

	it("rolls back incident counters and the notification outbox before replaying a wrapped conflict", async () => {
		const record = incidents.recordCheck.bind(incidents);
		let calls = 0;
		vi.spyOn(incidents, "recordCheck").mockImplementation(async (...args) => {
			await record(...args);
			if (++calls === 1) throw Object.assign(new Error("Objection DBError"), { nativeError: transient() });
		});
		expect(await monitor.run(11)).toMatchObject({ state: "down" });
		expect(calls).toBe(2);
		expect(probes).toBe(1);
		expect(state.alerts).toHaveBeenCalledTimes(1);
		expect(await state.db("proxy_host_monitor_check").where({ state: "down" })).toHaveLength(1);
		expect((await state.db("monitor_incident").first()).failure_count).toBe(1);
		expect((await state.db("monitor_daily").first()).checks).toBe(1);
		expect(await state.db("notification_delivery")).toHaveLength(1);
	});

	it("propagates the final conflict after three complete rollbacks and releases the host slot", async () => {
		failures.push(transient(), transient(), transient());
		const before = await state.db("proxy_host_monitor").first();
		await expect(monitor.run(11)).rejects.toThrow("Record has changed since last read");
		expect(statements.filter((sql) => /^BEGIN/i.test(sql))).toHaveLength(3);
		expect(statements.filter((sql) => /^ROLLBACK/i.test(sql))).toHaveLength(3);
		expect(await state.db("proxy_host_monitor").first()).toEqual(before);
		expect(await state.db("proxy_host_monitor_check")).toHaveLength(100);
		expect(await state.db("monitor_incident")).toHaveLength(0);
		expect(await state.db("monitor_daily")).toHaveLength(0);
		expect(await state.db("notification_delivery")).toHaveLength(0);
		expect(probes).toBe(1);
		expect(state.alerts).not.toHaveBeenCalled();
		expect(await monitor.run(11)).toMatchObject({ state: "down" });
		expect(probes).toBe(2);
	});

	it.each([
		["ER_PARSE_ERROR", 1064],
		["ECONNRESET", undefined],
		["ER_CHECKREAD", 1213],
		["ER_LOCK_DEADLOCK", 1020],
		["ER_CHECKREAD", "1020"],
	])("does not retry unrelated or inconsistent database errors %s/%s", async (code, errno) => {
		failures.push(transient(code, errno));
		await expect(monitor.run(11)).rejects.toThrow("Record has changed since last read");
		expect(statements.filter((sql) => /^BEGIN/i.test(sql))).toHaveLength(1);
		expect(await state.db("proxy_host_monitor_check")).toHaveLength(100);
		expect(await state.db("monitor_incident")).toHaveLength(0);
		expect(state.alerts).not.toHaveBeenCalled();
	});

	it("does not interpret a mysql-shaped error from a different database dialect as retryable", async () => {
		state.db.client.config.client = "better-sqlite3";
		failures.push(transient());
		await expect(monitor.run(11)).rejects.toThrow("Record has changed since last read");
		expect(statements.filter((sql) => /^BEGIN/i.test(sql))).toHaveLength(1);
		expect(state.alerts).not.toHaveBeenCalled();
	});

	it.each([
		["settings version", () => state.db("proxy_host_monitor").where("host_id", 11).increment("version", 1)],
		["monitor enablement", () => state.db("proxy_host_monitor").where("host_id", 11).update({ enabled: 0 })],
		["host enablement", () => state.db("proxy_host").where("id", 11).update({ enabled: 0 })],
		["host deletion", () => state.db("proxy_host").where("id", 11).update({ is_deleted: 1 })],
		["upstream address", () => state.db("proxy_host").where("id", 11).update({ forward_host: "127.0.0.2" })],
		["upstream port", () => state.db("proxy_host").where("id", 11).update({ forward_port: 9 })],
	])("discards a measured result when %s changes after a rollback", async (_field, change) => {
		failures.push(transient());
		afterRollback(change);
		expect(await monitor.run(11)).toBeNull();
		expect(probes).toBe(1);
		expect(await state.db("proxy_host_monitor_check")).toHaveLength(100);
		expect(await state.db("monitor_incident")).toHaveLength(0);
		expect(await state.db("notification_delivery")).toHaveLength(0);
		expect(state.alerts).not.toHaveBeenCalled();
	});

	it("does not save a stopped check after a rollback", async () => {
		failures.push(transient());
		afterRollback(() => monitor.stop());
		expect(await monitor.run(11)).toBeNull();
		expect(statements.filter((sql) => /^BEGIN/i.test(sql))).toHaveLength(1);
		expect(await state.db("proxy_host_monitor_check")).toHaveLength(100);
		expect(state.alerts).not.toHaveBeenCalled();
	});

	it("rechecks mute state after rollback before updating alerts and enqueuing delivery", async () => {
		failures.push(transient());
		afterRollback(() =>
			state.db("monitor_mute").insert({
				host_id: 11,
				starts_at: new Date(Date.now() - 60_000).toISOString(),
				ends_at: new Date(Date.now() + 60_000).toISOString(),
			}),
		);
		expect(await monitor.run(11)).toMatchObject({ state: "down" });
		expect((await state.db("notification_delivery").first()).status).toBe("muted");
		expect((await state.db("proxy_host_monitor").first()).last_alert_at).toBeNull();
		expect(state.alerts).not.toHaveBeenCalled();
	});

	it("recomputes transition and the alert cooldown from the newly committed monitor row", async () => {
		failures.push(transient());
		afterRollback(() =>
			state.db("proxy_host_monitor").where("host_id", 11).update({
				state: "down",
				last_alert_state: "down",
				last_alert_at: new Date().toISOString(),
			}),
		);
		expect(await monitor.run(11)).toMatchObject({ state: "down", transition: false });
		expect((await state.db("proxy_host_monitor_check").where({ state: "down" }).first()).transition).toBe(0);
		expect(state.alerts).not.toHaveBeenCalled();
	});
});
