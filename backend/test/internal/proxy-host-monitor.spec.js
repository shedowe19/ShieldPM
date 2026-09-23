import http from "node:http";
import net from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, alerts: vi.fn(), autoPush: vi.fn() }));
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
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: state.autoPush } }));

import internalChat from "../../internal/chat.js";
import monitor, { assertMonitorConfig, decideAlert, probeHttp, probeTcp } from "../../internal/proxy-host-monitor.js";
import { up } from "../../migrations/20260923000000_add_proxy_host_monitor.js";
import ProxyHostMonitor from "../../models/proxy_host_monitor.js";

const access = {
	can: vi.fn().mockResolvedValue({ permission_visibility: "user" }),
	token: { getUserId: () => 7 },
};
const settings = (overrides = {}) => ({
	enabled: true,
	type: "http",
	path: "/health",
	interval_seconds: 15,
	timeout_ms: 1000,
	expected_status: 200,
	alert_enabled: true,
	...overrides,
});
let server;
let port;
let responseStatus = 200;
let seenRequests;

describe("proxy host upstream monitor", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("proxy_host", (table) => {
			table.increments("id");
			table.integer("is_deleted").notNullable().defaultTo(0);
			table.integer("enabled").notNullable().defaultTo(1);
			table.integer("owner_user_id");
			table.string("forward_scheme");
			table.string("forward_host");
			table.integer("forward_port");
			table.string("terminal_host");
			table.integer("terminal_port");
		});
		await up(state.db);
		server = http.createServer((req, res) => {
			seenRequests.push({ path: req.url, cookie: req.headers.cookie });
			res.statusCode = req.url === "/base/health" ? responseStatus : 302;
			res.end("ignored body");
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		port = server.address().port;
	});
	beforeEach(async () => {
		monitor.stop();
		vi.clearAllMocks();
		responseStatus = 200;
		seenRequests = [];
		await state.db("proxy_host_monitor_check").delete();
		await state.db("proxy_host_monitor").delete();
		await state.db("proxy_host").delete();
		await state.db("proxy_host").insert({
			id: 11,
			enabled: 1,
			owner_user_id: 7,
			forward_scheme: "http",
			forward_host: "127.0.0.1/base",
			forward_port: port,
		});
		await state.db("proxy_host").insert({
			id: 12,
			enabled: 1,
			owner_user_id: 8,
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: port,
		});
	});
	afterAll(async () => {
		monitor.stop();
		await new Promise((resolve) => server.close(resolve));
		await state.db.destroy();
	});

	it("checks Nginx's upstream base path, saves transitions and sends owner alerts only after a failure", async () => {
		expect(internalChat).toEqual(expect.objectContaining({ sendHostMonitorAlert: expect.any(Function) }));
		await monitor.update(access, 11, settings());
		const first = await monitor.check(access, 11);
		expect(first).toMatchObject({ state: "up", status_code: 200, transition: true });
		expect(seenRequests).toEqual([{ path: "/base/health", cookie: undefined }]);
		expect(state.alerts).not.toHaveBeenCalled();

		responseStatus = 503;
		const failure = await monitor.run(11);
		expect(failure).toMatchObject({ state: "down", status_code: 503, transition: true });
		expect(state.alerts).toHaveBeenCalledWith(7, expect.stringContaining("DOWN"));
		const detail = await monitor.get(access, 11);
		expect(detail.history.map((check) => check.state)).toEqual(["down", "up"]);
		expect(detail.status.state).toBe("down");
		expect(detail.history[0].transition).toBe(true);
		expect(state.autoPush).toHaveBeenCalledWith("proxy-host-monitor");
	});

	it("enforces owner visibility and never probes disabled hosts", async () => {
		await monitor.update(access, 11, settings());
		expect(await monitor.listStatus(access, [11, 12])).toEqual([expect.objectContaining({ host_id: 11 })]);
		await state.db("proxy_host").where("id", 11).update({ enabled: 0 });
		await expect(monitor.check(access, 11)).rejects.toThrow("Enable the proxy host");
		expect((await monitor.get(access, 11)).status.state).toBe("paused");
		expect(seenRequests).toHaveLength(0);
	});

	it("rejects free URLs and file targets before scheduling probes", async () => {
		expect(() => assertMonitorConfig(settings({ path: "//remote.example.test/" }))).toThrow();
		expect(() => assertMonitorConfig(settings({ path: "/health?secret=1" }))).toThrow();
		expect(() => assertMonitorConfig(settings({ interval_seconds: 15, timeout_ms: 15000 }))).toThrow();
		await state
			.db("proxy_host")
			.where("id", 11)
			.update({ forward_scheme: "path", forward_host: "/data/websites/a" });
		await expect(monitor.update(access, 11, settings({ type: "tcp" }))).rejects.toThrow("unsupported");
	});

	it("bounds persisted check history per host and purges it on deletion", async () => {
		await monitor.update(access, 11, settings({ alert_enabled: false }));
		for (let i = 0; i < 103; i++) await monitor.run(11);
		expect(await state.db("proxy_host_monitor_check").where("host_id", 11).count("id as count").first()).toEqual({
			count: 100,
		});
		await monitor.removeHost(11);
		expect(await ProxyHostMonitor.query().findOne({ host_id: 11 })).toBeUndefined();
		expect(await state.db("proxy_host_monitor_check").where("host_id", 11)).toHaveLength(0);
	});
	it("expires old history even when the monitor is paused", async () => {
		await monitor.update(access, 11, settings({ enabled: false }));
		await state.db("proxy_host_monitor_check").insert([
			{ host_id: 11, checked_at: "2020-01-01T00:00:00.000Z", state: "up" },
			{ host_id: 11, checked_at: new Date().toISOString(), state: "down" },
		]);
		await monitor.tick();
		const rows = await state.db("proxy_host_monitor_check").where("host_id", 11);
		expect(rows).toHaveLength(1);
		expect(rows[0].state).toBe("down");
	});

	it("dampens flapping alerts and eventually announces a stable recovery", () => {
		const start = new Date("2026-09-23T12:00:00.000Z").toISOString();
		const initial = decideAlert(
			{ alert_enabled: true, last_alert_state: null, last_alert_at: null },
			"down",
			start,
		);
		expect(initial).toMatchObject({ send: true, last_alert_state: "down" });
		const pending = decideAlert({ alert_enabled: true, ...initial }, "up", "2026-09-23T12:01:00.000Z");
		expect(pending).toMatchObject({ send: false, last_alert_state: "down" });
		const recovery = decideAlert({ alert_enabled: true, ...pending }, "up", "2026-09-23T12:05:00.000Z");
		expect(recovery).toMatchObject({ send: true, last_alert_state: "up" });
	});
});

describe("network probes", () => {
	it("discards redirects without following them, and times out on stalled HTTP responses", async () => {
		const server = http.createServer((req, res) => {
			if (req.url === "/redirect") {
				res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
				res.end();
			}
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		try {
			const host = { forward_scheme: "http", forward_host: "127.0.0.1", forward_port: server.address().port };
			expect(await probeHttp(host, { path: "/redirect", expected_status: 200, timeout_ms: 100 })).toMatchObject({
				state: "down",
				status_code: 302,
			});
			expect(await probeHttp(host, { path: "/stall", expected_status: 200, timeout_ms: 50 })).toMatchObject({
				state: "down",
				message: "Timed out",
			});
		} finally {
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		}
	});

	it("connects to configured TCP target without sending data", async () => {
		const server = net.createServer((socket) => socket.end());
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		try {
			expect(
				await probeTcp({ forward_host: "127.0.0.1", forward_port: server.address().port }, { timeout_ms: 500 }),
			).toMatchObject({ state: "up", message: "TCP connected" });
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
