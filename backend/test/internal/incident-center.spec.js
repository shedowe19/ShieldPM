import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { Ajv } from "ajv";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const state = vi.hoisted(() => ({ database: null, send: vi.fn(), telegram: vi.fn() }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	isDemoMode: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../lib/notification-http.js", async (original) => ({
	...(await original()),
	deliverNotification: state.send,
}));
vi.mock("../../internal/chat.js", () => ({ default: { sendHostMonitorAlert: state.telegram } }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));

import incidents from "../../internal/incidents.js";
import monitor, { probePool, pruneHistory } from "../../internal/proxy-host-monitor.js";
import { getPoolObservations } from "../../lib/upstream-pool-observations.js";
import {
	MonitorDaily,
	MonitorIncident,
	MonitorLatency,
	MonitorObservation,
	NotificationDelivery,
} from "../../models/monitor_incident.js";
import ProxyHost from "../../models/proxy_host.js";
import ProxyHostMonitor from "../../models/proxy_host_monitor.js";
import ProxyHostMonitorCheck from "../../models/proxy_host_monitor_check.js";
import incidentsRouter from "../../routes/incidents.js";

const access = { can: vi.fn().mockResolvedValue({ permission_visibility: "user" }), token: { getUserId: () => 7 } };
const other = { can: vi.fn().mockResolvedValue({ permission_visibility: "all" }), token: { getUserId: () => 8 } };
const config = {
	enabled: true,
	type: "http",
	path: "/",
	interval_seconds: 60,
	timeout_ms: 1000,
	expected_status: 200,
	alert_enabled: true,
};
const result = (status) => ({
	state: status,
	response_ms: 30,
	status_code: status === "up" ? 200 : 503,
	message: `HTTP ${status === "up" ? 200 : 503}`,
});
let host;
let now = Date.parse("2026-10-17T12:00:00.000Z");
const save = (status, at = now, muted = false) =>
	MonitorIncident.transaction(async (trx) =>
		incidents.recordCheck(trx, host, config, result(status), new Date(at).toISOString(), muted),
	);
const target = (overrides = {}) =>
	incidents.saveTarget(access, null, {
		name: "Webhook",
		type: "webhook",
		enabled: true,
		host_ids: [11],
		url: "https://notify.example/events/secret-path",
		token: "synthetic-secret-token",
		...overrides,
	});
let apiServer;
let apiOrigin;
let server;
let backupServer;
let backupStatus = 200;
let seenHost = "";

describe("durable incident center", () => {
	beforeAll(async () => {
		const directory = backendSourcePath("migrations");
		for (const filename of (await fs.readdir(directory)).filter((name) => name.endsWith(".js")).sort())
			await (await import(path.join(directory, filename))).up(state.database);
		server = http.createServer((req, res) => {
			if (req.url === "/hang" || req.url === "/all-hang") return;
			res.statusCode = 503;
			res.end("not retained");
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		backupServer = http.createServer((req, res) => {
			seenHost = req.headers.host;
			if (req.url === "/all-hang") return;
			res.statusCode = backupStatus;
			res.end("backup");
		});
		await new Promise((resolve) => backupServer.listen(0, "127.0.0.1", resolve));
		const app = express();
		app.use(express.json());
		app.use((req, res, next) => {
			res.locals.access = req.headers["x-test-user"] === "other" ? other : access;
			next();
		});
		app.use("/api/incidents", incidentsRouter);
		app.use((error, _req, res, _next) =>
			res.status(error.status || error.code || 500).json({ error: { message: error.message } }),
		);
		apiServer = http.createServer(app);
		await new Promise((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
		apiOrigin = `http://127.0.0.1:${apiServer.address().port}/api/incidents`;
	});
	beforeEach(async () => {
		await incidents.stop();
		monitor.stop();
		vi.restoreAllMocks();
		vi.clearAllMocks();
		now = Date.parse("2026-10-17T12:00:00.000Z");
		vi.spyOn(Date, "now").mockImplementation(() => now);
		await state.database.raw("DROP TRIGGER IF EXISTS reject_rollup");
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
			"host_domain_claim_owner",
			"host_domain_claim",
			"host_domain",
			"proxy_host",
		])
			await state.database(table).delete();
		host = await ProxyHost.query().insertAndFetch({
			id: 11,
			owner_user_id: 7,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: server.address().port,
			enabled: 1,
			locations: [],
			meta: {},
		});
		backupStatus = 200;
		seenHost = "";
		state.send.mockReset().mockResolvedValue(204);
		incidents.init();
		await incidents.tick();
	});
	afterEach(async () => {
		await incidents.stop();
		vi.restoreAllMocks();
	});
	afterAll(async () => {
		apiServer.closeAllConnections();
		await new Promise((resolve) => apiServer.close(resolve));
		server.closeAllConnections();
		backupServer.closeAllConnections();
		await Promise.all([
			new Promise((resolve) => server.close(resolve)),
			new Promise((resolve) => backupServer.close(resolve)),
		]);
		await state.database.destroy();
	});

	it("keeps sustained outages through unknown checks and closes only on recovery", async () => {
		await save("down");
		await save("down", now + 60_000);
		await save("unknown", now + 120_000);
		let [incident] = await MonitorIncident.query();
		expect(incident).toMatchObject({ failure_count: 2, resolved_at: null });
		await save("up", now + 180_000);
		incident = await MonitorIncident.query().findById(incident.id);
		expect(incident).toMatchObject({ resolution: "recovered", resolved_at: new Date(now + 180_000).toISOString() });
	});
	it("retains aggregate data after the hundred-check limit and leaves missing time unknown", async () => {
		const beginning = now - 10 * 60 * 60_000;
		for (let index = 0; index < 105; index++) {
			const at = new Date(beginning + index * 60_000).toISOString();
			await MonitorIncident.transaction(async (trx) => {
				await ProxyHostMonitorCheck.query(trx).insert({
					host_id: 11,
					checked_at: at,
					...result("up"),
					transition: false,
				});
				await incidents.recordCheck(trx, host, config, result("up"), at, false);
				await pruneHistory(11, trx);
			});
		}
		expect(await ProxyHostMonitorCheck.query().resultSize()).toBe(100);
		expect((await MonitorDaily.query().first()).checks).toBe(105);
		expect(await MonitorLatency.query().resultSize()).toBe(105);
		const detail = await incidents.hostDetail(access, 11, 1);
		expect(detail.daily[0].up_ms).toBe(105 * 60_000);
		expect(detail.daily[0].unknown_ms).toBe(12 * 60 * 60_000 - 105 * 60_000);
		expect(detail.daily[0].uptime_percent).toBe(100);
		expect(detail.daily[0].coverage_percent).toBeLessThan(15);
	});
	it("splits an observed interval at UTC midnight and does not infer a long gap as uptime", async () => {
		const midnight = Date.parse("2026-10-17T00:00:00.000Z");
		await save("up", midnight - 30_000);
		await save("down", midnight + 10 * 60_000);
		const rows = await MonitorDaily.query().orderBy("day");
		expect(rows.map((row) => [row.day, row.up_ms])).toEqual([
			["2026-10-16", 30_000],
			["2026-10-17", 30_000],
		]);
	});
	it("rolls back check, status, incident and outbox if aggregate persistence fails", async () => {
		await target();
		await ProxyHostMonitor.query().insert({ host_id: 11, ...config });
		await state.database.raw(
			"CREATE TRIGGER reject_rollup BEFORE INSERT ON monitor_daily BEGIN SELECT RAISE(ABORT, 'rollup rejected'); END",
		);
		await expect(monitor.run(11)).rejects.toThrow("rollup rejected");
		expect(await ProxyHostMonitorCheck.query().resultSize()).toBe(0);
		expect((await ProxyHostMonitor.query().findOne({ host_id: 11 })).state).toBe("unknown");
		expect(await MonitorIncident.query().resultSize()).toBe(0);
		expect(await NotificationDelivery.query().resultSize()).toBe(0);
		expect(state.telegram).not.toHaveBeenCalled();
	});
	it("persists a real local upstream failure and sends a channel notification from its outbox", async () => {
		await target();
		await ProxyHostMonitor.query().insert({ host_id: 11, ...config });
		expect(await monitor.run(11)).toMatchObject({ state: "down", status_code: 503 });
		expect(state.send).not.toHaveBeenCalled();
		now = Date.parse(new Date().toISOString()) + 100;
		await incidents.tick();
		expect(state.send).toHaveBeenCalledOnce();
		expect((await NotificationDelivery.query().first()).status).toBe("sent");
		expect(state.send.mock.calls[0][2]).toMatchObject({ event: "incident.opened", host_id: 11, state: "down" });
	});
	it("redacts stored credentials, preserves them on blank edit and rejects stale versions", async () => {
		const created = await target();
		expect(JSON.stringify(created)).not.toMatch(/secret-path|synthetic-secret-token|"secret"/);
		const updated = await incidents.saveTarget(access, created.id, { ...created, name: "Renamed", url: "" });
		expect(updated).toMatchObject({ name: "Renamed", has_credentials: true, version: created.version + 1 });
		await expect(incidents.saveTarget(access, created.id, { ...created, name: "stale" })).rejects.toThrow(
			"changed",
		);
		await save("down");
		await incidents.tick();
		expect(state.send.mock.calls[0][1]).toEqual({
			url: "https://notify.example/events/secret-path",
			token: "synthetic-secret-token",
		});
	});
	it("bounds retries, exposes safe failure text and allows explicit retry", async () => {
		await target();
		await save("down");
		state.send.mockRejectedValue(new Error("https://secret.example/token/raw-private-key"));
		for (let index = 0; index < 5; index++) {
			await incidents.tick();
			now += 3_600_001;
		}
		const delivery = await NotificationDelivery.query().first();
		expect(delivery).toMatchObject({ status: "failed", attempts: 5 });
		expect(delivery.last_error).not.toMatch(/secret.example|raw-private-key/);
		await incidents.retry(access, delivery.id);
		state.send.mockResolvedValue(200);
		await incidents.tick();
		expect((await NotificationDelivery.query().findById(delivery.id)).status).toBe("sent");
	});
	it("recovers interrupted delivery leases without exceeding the final attempt", async () => {
		await target();
		await save("down");
		const delivery = await NotificationDelivery.query().first();
		await delivery
			.$query()
			.patch({ status: "sending", attempts: 5, next_attempt_at: new Date(now - 1).toISOString() });
		await incidents.tick();
		expect(state.send).not.toHaveBeenCalled();
		expect(await NotificationDelivery.query().findById(delivery.id)).toMatchObject({
			status: "failed",
			attempts: 5,
		});
		await delivery
			.$query()
			.patch({ status: "sending", attempts: 3, next_attempt_at: new Date(now - 1).toISOString() });
		await expect(incidents.retry(access, delivery.id)).rejects.toThrow("Only failed");
		await incidents.tick();
		expect(state.send).toHaveBeenCalledTimes(1);
		expect(await NotificationDelivery.query().findById(delivery.id)).toMatchObject({ status: "sent", attempts: 4 });
	});
	it("suppresses channels and Telegram during alarm mutes without pausing monitoring", async () => {
		await target();
		await incidents.setMute(access, 11, {
			starts_at: new Date(Date.now() - 60000).toISOString(),
			ends_at: new Date(Date.now() + 3600000).toISOString(),
			reason: "Deploy",
		});
		// The local monitor uses actual wall-clock time; align the mute to that measurement too.
		const clock = Date.parse(new Date().toISOString());
		await state.database("monitor_mute").update({
			starts_at: new Date(clock - 60000).toISOString(),
			ends_at: new Date(clock + 3600000).toISOString(),
		});
		await ProxyHostMonitor.query().insert({ host_id: 11, ...config });
		expect(await monitor.run(11)).toMatchObject({ state: "down" });
		expect(await MonitorIncident.query().resultSize()).toBe(1);
		expect((await NotificationDelivery.query().first()).status).toBe("muted");
		expect(state.telegram).not.toHaveBeenCalled();
		await incidents.tick();
		expect(state.send).not.toHaveBeenCalled();
	});
	it("applies a new mute to already queued retries and isolates other users", async () => {
		await target();
		await save("down");
		await incidents.setMute(access, 11, {
			starts_at: new Date(now - 1).toISOString(),
			ends_at: new Date(now + 60_000).toISOString(),
			reason: "Quiet",
		});
		await incidents.tick();
		expect((await NotificationDelivery.query().first()).status).toBe("muted");
		expect(state.send).not.toHaveBeenCalled();
		expect(await incidents.targets(other)).toEqual([]);
		expect(await incidents.deliveries(other)).toEqual([]);
		await expect(incidents.retry(other, (await NotificationDelivery.query().first()).id)).rejects.toMatchObject({
			status: 404,
		});
	});
	it("records resets as monitoring changes, keeps history and removes private records on host deletion", async () => {
		await save("down");
		await incidents.resetHost(11);
		expect((await MonitorIncident.query().first()).resolution).toBe("monitor_changed");
		expect(await MonitorObservation.query().resultSize()).toBe(0);
		expect(await MonitorDaily.query().resultSize()).toBe(1);
		await incidents.removeHost(11);
		expect(await MonitorIncident.query().resultSize()).toBe(0);
		expect(await MonitorDaily.query().resultSize()).toBe(0);
	});
	it("checks a serving pool rather than its dead legacy target and retains per-target observations", async () => {
		const pool = {
			enabled: true,
			host_header: "application.example",
			targets: [
				{ id: "primary", host: "127.0.0.1", port: server.address().port },
				{ id: "backup", host: "127.0.0.1", port: backupServer.address().port, backup: true },
			],
		};
		await host.$query().patch({ meta: { upstream_pool: pool } });
		await state.database("host_domain").insert({ proxy_host_id: 11, domain_name: "public.example" });
		await ProxyHostMonitor.query().insert({ host_id: 11, ...config });
		expect(await monitor.run(11)).toMatchObject({ state: "up", status_code: 200 });
		expect(seenHost).toBe("application.example");
		expect(await MonitorIncident.query().resultSize()).toBe(0);
		const current = await ProxyHost.query().findById(11).withGraphFetched("host_domains");
		const observations = getPoolObservations(current);
		expect(observations.get("primary")).toMatchObject({ state: "down", status_code: 503 });
		expect(observations.get("backup")).toMatchObject({ state: "up", status_code: 200 });
		await current.$query().patch({ meta: { upstream_pool: { ...pool, host_header: "changed.example" } } });
		expect(getPoolObservations(current).size).toBe(0);
	});
	it("opens one incident when every primary and backup fails", async () => {
		backupStatus = 503;
		await host.$query().patch({
			meta: {
				upstream_pool: {
					enabled: true,
					targets: [
						{ id: "primary", host: "127.0.0.1", port: server.address().port },
						{ id: "backup", host: "127.0.0.1", port: backupServer.address().port, backup: true },
					],
				},
			},
		});
		await ProxyHostMonitor.query().insert({ host_id: 11, ...config });
		expect(await monitor.run(11)).toMatchObject({ state: "down", message: "All upstream pool targets failed" });
		expect(await MonitorIncident.query().resultSize()).toBe(1);
	});
	it("reserves timeout for a healthy backup instead of spending the whole budget on a hanging primary", async () => {
		const value = {
			...host,
			domain_names: ["application.example"],
			meta: {
				upstream_pool: {
					enabled: true,
					targets: [
						{ id: "hanging", host: "127.0.0.1", port: server.address().port },
						{ id: "backup", host: "127.0.0.1", port: backupServer.address().port, backup: true },
					],
				},
			},
		};
		const started = performance.now();
		expect(await probePool(value, { ...config, timeout_ms: 300, path: "/hang" })).toMatchObject({ state: "up" });
		expect(performance.now() - started).toBeLessThan(600);
		expect(seenHost).toBe("application.example");
	});
	it("keeps a shared-budget pool timeout unknown instead of declaring slow targets down", async () => {
		const value = {
			...host,
			domain_names: ["application.example"],
			meta: {
				upstream_pool: {
					enabled: true,
					targets: [
						{ id: "primary", host: "127.0.0.1", port: server.address().port },
						{ id: "backup", host: "127.0.0.1", port: backupServer.address().port, backup: true },
					],
				},
			},
		};
		const measured = await probePool(value, { ...config, timeout_ms: 300, path: "/all-hang" });
		expect(measured.state).toBe("unknown");
		expect(measured.targets).toHaveLength(2);
		expect(measured.targets.every((candidate) => candidate.state === "unknown")).toBe(true);
	});
	it("serves the complete REST channel/mute/retry contracts and validates response schemas", async () => {
		const request = (suffix, method = "GET", data = undefined, asOther = false) =>
			fetch(`${apiOrigin}${suffix}`, {
				method,
				headers: { "Content-Type": "application/json", ...(asOther ? { "x-test-user": "other" } : {}) },
				...(data ? { body: JSON.stringify(data) } : {}),
			});
		const created = await request("/targets", "POST", {
			name: "REST channel",
			type: "webhook",
			enabled: true,
			host_ids: [11],
			url: "https://notify.example/private-path",
			token: "rest-secret",
		});
		expect(created.status).toBe(201);
		const channel = await created.json();
		expect(JSON.stringify(channel)).not.toMatch(/private-path|rest-secret|"secret"/);
		const validate = new Ajv({ strict: false, validateFormats: false }).compile(
			JSON.parse(await fs.readFile(backendSourcePath("schema/components/notification-target.json"), "utf8")),
		);
		expect(validate(channel), JSON.stringify(validate.errors)).toBe(true);
		expect(await (await request("/targets", "GET", undefined, true)).json()).toEqual([]);
		expect(
			(
				await request(
					`/targets/${channel.id}`,
					"PUT",
					{ name: "No owner bypass", type: "webhook", enabled: true, host_ids: [], version: channel.version },
					true,
				)
			).status,
		).toBe(404);
		expect(
			(
				await request("/targets", "POST", {
					name: "Unsafe",
					type: "webhook",
					enabled: true,
					host_ids: [],
					url: "https://127.0.0.1/private",
				})
			).status,
		).toBe(400);
		expect(
			(
				await request("/targets", "POST", {
					name: "Unknown field",
					type: "webhook",
					enabled: true,
					host_ids: [],
					url: "https://notify.example/",
					extra: true,
				})
			).status,
		).toBe(400);
		const window = {
			starts_at: new Date(now - 1000).toISOString(),
			ends_at: new Date(now + 60_000).toISOString(),
			reason: "Deploy",
		};
		expect((await request("/hosts/11/mute", "PUT", window)).status).toBe(200);
		await save("down", now, true);
		const details = await (await request("/hosts/11?days=7")).json();
		const validateDetails = new Ajv({ strict: false, validateFormats: false }).compile(
			JSON.parse(await fs.readFile(backendSourcePath("schema/components/incident-host-detail.json"), "utf8")),
		);
		expect(validateDetails(details), JSON.stringify(validateDetails.errors)).toBe(true);
		expect((await request("/hosts/11/mute", "PUT", { clear: true })).status).toBe(200);
		const [delivery] = await (await request("/deliveries")).json();
		expect(delivery.status).toBe("muted");
		expect((await request(`/deliveries/${delivery.id}/retry`, "POST", {})).status).toBe(200);
		const audit = JSON.stringify(await state.database("audit_log"));
		expect(audit).not.toMatch(/private-path|rest-secret|synthetic-secret-token/);
		expect(audit).toContain("notification-channel");
	});
});
