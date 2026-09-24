import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import monitor, {
	assertMonitorConfig,
	decideAlert,
	formatHostMonitorAlert,
	networkMessage,
	probeHttp,
	probeTcp,
} from "../../internal/proxy-host-monitor.js";
import { up } from "../../migrations/20260923000000_add_proxy_host_monitor.js";
import { up as addTlsOptions } from "../../migrations/20260923000001_add_proxy_host_monitor_tls_options.js";
import { up as addSkipCertificateVerification } from "../../migrations/20260924000000_add_proxy_host_monitor_skip_certificate_verification.js";
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
		await state.db.schema.createTable("host_domain", (table) => {
			table.increments("id");
			table.integer("proxy_host_id");
			table.string("domain_name");
		});
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
		await addTlsOptions(state.db);
		await addSkipCertificateVerification(state.db);
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
		await state.db("host_domain").delete();
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
		await state.db("host_domain").insert({ proxy_host_id: 11, domain_name: "app.example.test" });
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
		expect(state.alerts).toHaveBeenCalledWith(
			7,
			expect.stringContaining(
				`Proxy-Host #11 ist DOWN\nDomain: app.example.test\nZiel: http://127.0.0.1:${port}/base/health`,
			),
		);
		expect(state.alerts.mock.calls[0][1]).toContain("HTTP-Status: 503 (erwartet 200)");
		expect(state.alerts.mock.calls[0][1]).toContain(
			"Diagnose: Der Upstream antwortete mit HTTP 503 statt HTTP 200.",
		);
		expect(state.alerts.mock.calls[0][1]).toContain("Hinweis: Dienst hinter dem Proxy und dessen Logs prüfen.");
		expect(state.alerts.mock.calls[0][1]).toMatch(/Zeitpunkt \(UTC\): \d{4}-\d\d-\d\dT/);
		expect(state.alerts.mock.calls[0][1]).not.toContain("ignored body");
		const detail = await monitor.get(access, 11);
		expect(detail.history.map((check) => check.state)).toEqual(["down", "up"]);
		expect(detail.status.state).toBe("down");
		expect(detail.history[0].transition).toBe(true);
		expect(state.autoPush).toHaveBeenCalledWith("proxy-host-monitor");
	});

	it("diagnoses an HTTP response timeout and includes the health endpoint and configured limit", async () => {
		const stalled = http.createServer(() => {});
		await new Promise((resolve) => stalled.listen(0, "127.0.0.1", resolve));
		try {
			await state.db("proxy_host").where("id", 11).update({ forward_port: stalled.address().port });
			await monitor.update(access, 11, settings({ timeout_ms: 500 }));
			expect(await monitor.run(11)).toMatchObject({ state: "down", message: "Timed out during headers" });
			expect(state.alerts).toHaveBeenCalledTimes(1);
			const message = state.alerts.mock.calls[0][1];
			expect(message).toContain(`Ziel: http://127.0.0.1:${stalled.address().port}/base/health`);
			expect(message).toContain("HTTP-Status: keine Antwort (erwartet 200)");
			expect(message).toContain("Zeitlimit: 500 ms");
			expect(message).toContain("keine HTTP-Antwortheader innerhalb des Zeitlimits");
			expect(message).toContain("Health-Endpunkt und Anwendung prüfen");
		} finally {
			stalled.closeAllConnections();
			await new Promise((resolve) => stalled.close(resolve));
		}
	});

	it("reports the last failed measurement when a recovery alert waits out the cooldown", async () => {
		await monitor.update(access, 11, settings());
		await monitor.run(11);
		responseStatus = 503;
		await monitor.run(11);
		expect(state.alerts).toHaveBeenCalledTimes(1);
		responseStatus = 200;
		await monitor.run(11);
		expect(state.alerts).toHaveBeenCalledTimes(1);
		await state
			.db("proxy_host_monitor")
			.where("host_id", 11)
			.update({ last_alert_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() });
		await monitor.run(11);
		expect(state.alerts).toHaveBeenCalledTimes(2);
		expect(state.alerts.mock.calls[1][1]).toContain("Proxy-Host #11 ist UP");
		expect(state.alerts.mock.calls[1][1]).toContain("Vorheriger Befund: Der Upstream antwortete mit HTTP 503");
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
		expect(() =>
			assertMonitorConfig(
				settings({ upstream_ca: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----" }),
			),
		).toThrow();
		expect(() => assertMonitorConfig(settings({ upstream_ca: "x".repeat(65_537) }))).toThrow();
		expect(() =>
			assertMonitorConfig(settings({ upstream_ca: `-----BEGIN CERTIFICATE----- ${"\t".repeat(50_000)}` })),
		).toThrow();
		expect(() => assertMonitorConfig(settings({ upstream_server_name: "../other" }))).toThrow();
		expect(() => assertMonitorConfig(settings({ upstream_server_name: "backend.example.test." }))).toThrow();
		expect(() => assertMonitorConfig(settings({ skip_certificate_verification: null }))).toThrow();
		expect(() => assertMonitorConfig(settings({ skip_certificate_verification: "true" }))).toThrow();
		expect(assertMonitorConfig(settings()).skip_certificate_verification).toBe(false);
		await expect(monitor.update(access, 11, settings({ skip_certificate_verification: true }))).rejects.toThrow(
			"HTTPS upstream",
		);
		await expect(
			monitor.update(access, 11, settings({ type: "tcp", skip_certificate_verification: true })),
		).rejects.toThrow("HTTPS upstream");
		await state
			.db("proxy_host")
			.where("id", 11)
			.update({ forward_scheme: "path", forward_host: "/data/websites/a" });
		await expect(monitor.update(access, 11, settings({ type: "tcp" }))).rejects.toThrow("unsupported");
	});

	it("clears the HTTPS certificate exception for every new upstream, including HTTPS", async () => {
		await state.db("proxy_host").where("id", 11).update({ forward_scheme: "https" });
		await monitor.update(access, 11, settings({ skip_certificate_verification: true }));
		expect((await monitor.get(access, 11)).config.skip_certificate_verification).toBe(true);
		await state.db("proxy_host").where("id", 11).update({ forward_host: "other.internal.test" });
		await monitor.resetHost(11, { disableUnsupported: true });
		expect((await monitor.get(access, 11)).config.skip_certificate_verification).toBe(false);
		await monitor.update(access, 11, settings({ skip_certificate_verification: true }));
		expect((await monitor.get(access, 11)).config.skip_certificate_verification).toBe(true);
		await state.db("proxy_host").where("id", 11).update({ forward_scheme: "http" });
		await monitor.resetHost(11, { disableUnsupported: true });
		expect((await monitor.get(access, 11)).config.skip_certificate_verification).toBe(false);
		await state.db("proxy_host").where("id", 11).update({ forward_scheme: "https" });
		await monitor.resetHost(11, { disableUnsupported: true });
		expect((await monitor.get(access, 11)).config.skip_certificate_verification).toBe(false);
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
		const unverifiable = decideAlert({ alert_enabled: true, ...initial }, "unknown", "2026-09-23T12:10:00.000Z");
		expect(unverifiable).toEqual({ send: false, last_alert_state: "down", last_alert_at: start });
		expect(
			decideAlert({ alert_enabled: true, last_alert_state: null, last_alert_at: null }, "unknown", start),
		).toEqual({ send: false, last_alert_state: null, last_alert_at: null });
	});

	it("explains a recovery without inventing outage duration, and keeps malformed domain text on one line", () => {
		const message = formatHostMonitorAlert(
			52,
			settings({ type: "tcp", timeout_ms: 1000 }),
			{ forward_scheme: "terminal", forward_host: "127.0.0.1", forward_port: 22 },
			{ state: "up", message: "TCP connected", status_code: null, response_ms: 12 },
			{ state: "down", message: "Connection refused (ECONNREFUSED)", status_code: null },
			[{ domain_name: "web.example.test\nShieldPM: forged alert" }],
			"2026-09-24T10:00:00.000Z",
		);
		expect(message).toContain("Proxy-Host #52 ist UP");
		expect(message).toContain("Ziel: 127.0.0.1:22");
		expect(message).toContain("Prüfung: TCP-Verbindung");
		expect(message).toContain("Vorheriger Befund: TCP-Verbindung zum Zielport wurde abgelehnt");
		expect(message).not.toContain("Domain:");
		expect(message).not.toContain("Dauer des Ausfalls");
		expect(message.length).toBeLessThan(4096);
	});

	it("describes DNS, refused ports and protocol mismatches without exposing raw socket errors", () => {
		expect(networkMessage("EPROTO")).toBe("Connection failed");
		expect(networkMessage("ERR_SSL_WRONG_VERSION_NUMBER")).toBe("Connection failed");
		expect(networkMessage("EPROTO", true)).toBe("TLS handshake failed (EPROTO)");
		const target = { forward_scheme: "https", forward_host: "127.0.0.1", forward_port: 81, path: "/health" };
		const result = (message) => ({ state: "down", message, response_ms: 130, status_code: null });
		const formatted = (reason) =>
			formatHostMonitorAlert(
				52,
				settings(),
				target,
				result(reason),
				{ state: "up" },
				[],
				"2026-09-24T10:00:00.000Z",
			);
		expect(formatted("DNS lookup failed (ENOTFOUND)")).toContain("DNS konnte den Zielnamen nicht auflösen");
		expect(formatted("Connection refused (ECONNREFUSED)")).toContain("Dienst auf diesem Host und Port lauscht");
		expect(formatted("TLS handshake failed (EPROTO)")).toContain("Eventuell spricht der Port HTTP statt HTTPS");
		expect(formatted("Timed out during tls")).toContain("TLS-Handshake nicht innerhalb des Zeitlimits");
		expect(formatted("arbitrary\nsecret value")).not.toContain("secret value");
	});

	it("masks token-shaped path segments and does not leak private monitor options", () => {
		const message = formatHostMonitorAlert(
			52,
			settings({
				upstream_ca: "-----BEGIN CERTIFICATE-----secret-ca",
				upstream_server_name: "private.example.test",
				skip_certificate_verification: true,
			}),
			{
				forward_scheme: "https",
				forward_host: "127.0.0.1",
				forward_port: 81,
				path: "/health/token/shortsecret/key=exposed/0123456789abcdefghijklmnopqrstuvw",
			},
			{ state: "down", message: "Timed out during headers", status_code: null, response_ms: 500 },
			{ state: "up" },
			[],
			"2026-09-24T10:00:00.000Z",
		);
		expect(message).toContain("/health/token/[redigiert]/[redigiert]/[redigiert]");
		expect(message).toContain("TLS-Zertifikat: Prüfung deaktiviert");
		expect(message).not.toMatch(/shortsecret|exposed|secret-ca|private.example.test/);
	});

	it.skipIf(spawnSync("openssl", ["version"]).status !== 0)(
		"records unverifiable HTTPS as unknown without alerts, then uses an explicit CA and DNS identity",
		async () => {
			const directory = mkdtempSync(join(tmpdir(), "shieldpm-monitor-tls-"));
			let secureServer;
			try {
				const keyPath = join(directory, "upstream.key");
				const certPath = join(directory, "upstream.pem");
				const generated = spawnSync(
					"openssl",
					[
						"req",
						"-x509",
						"-nodes",
						"-newkey",
						"rsa:2048",
						"-keyout",
						keyPath,
						"-out",
						certPath,
						"-days",
						"2",
						"-subj",
						"/CN=private.example.test",
						"-addext",
						"subjectAltName=DNS:private.example.test",
					],
					{ stdio: "ignore" },
				);
				if (generated.status !== 0) throw new Error("Failed to generate HTTPS test certificate");
				const ca = readFileSync(certPath, "utf8");
				const largestPem = ca + " ".repeat(65_535 - Buffer.byteLength(ca, "utf8"));
				expect(assertMonitorConfig(settings({ upstream_ca: largestPem })).upstream_ca).toBe(largestPem);
				expect(() => assertMonitorConfig(settings({ upstream_ca: `${largestPem} ` }))).toThrow();
				const requests = vi.fn((_req, res) => {
					res.writeHead(200);
					res.end();
				});
				secureServer = https.createServer({ key: readFileSync(keyPath), cert: ca }, requests);
				await new Promise((resolve) => secureServer.listen(0, "127.0.0.1", resolve));
				await state.db("proxy_host").where("id", 11).update({
					forward_scheme: "https",
					forward_host: "127.0.0.1",
					forward_port: secureServer.address().port,
				});
				await monitor.update(access, 11, settings());
				const untrusted = await monitor.run(11);
				expect(untrusted).toMatchObject({ state: "unknown", message: "TLS certificate could not be verified" });
				expect(requests).not.toHaveBeenCalled();
				expect(state.alerts).not.toHaveBeenCalled();
				expect((await monitor.get(access, 11)).history).toHaveLength(1);
				expect((await monitor.get(access, 11)).config.skip_certificate_verification).toBe(false);

				await monitor.update(
					access,
					11,
					settings({ skip_certificate_verification: true, upstream_server_name: "other.example.test" }),
				);
				expect((await monitor.get(access, 11)).history).toHaveLength(0);
				const accepted = await monitor.run(11);
				expect(accepted).toMatchObject({ state: "up", status_code: 200 });
				expect(requests).toHaveBeenCalledTimes(1);
				expect((await monitor.get(access, 11)).config.skip_certificate_verification).toBe(true);
				expect(state.alerts).not.toHaveBeenCalled();

				await monitor.update(access, 11, settings());
				expect((await monitor.get(access, 11)).history).toHaveLength(0);
				expect(await monitor.run(11)).toMatchObject({ state: "unknown" });
				expect(requests).toHaveBeenCalledTimes(1);

				await monitor.update(access, 11, settings({ upstream_ca: ca }));
				expect(await monitor.run(11)).toMatchObject({ state: "unknown" });
				expect(requests).toHaveBeenCalledTimes(1);

				await monitor.update(
					access,
					11,
					settings({ upstream_ca: ca, upstream_server_name: "private.example.test" }),
				);
				expect(await monitor.run(11)).toMatchObject({ state: "up", status_code: 200 });
				expect(requests).toHaveBeenCalledTimes(2);
				expect(state.alerts).not.toHaveBeenCalled();
				expect((await monitor.get(access, 11)).history).toHaveLength(1);

				await monitor.update(
					access,
					11,
					settings({ upstream_ca: ca, upstream_server_name: "other.example.test" }),
				);
				expect(await monitor.run(11)).toMatchObject({
					state: "unknown",
					message: "TLS certificate could not be verified",
				});
				expect(requests).toHaveBeenCalledTimes(2);
				expect(state.alerts).not.toHaveBeenCalled();
			} finally {
				if (secureServer?.listening) await new Promise((resolve) => secureServer.close(resolve));
				rmSync(directory, { recursive: true, force: true });
			}
		},
	);
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
				message: "Timed out during headers",
			});
		} finally {
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		}
	});

	it("distinguishes a stalled HTTPS handshake from a server that has returned HTTP headers", async () => {
		const sockets = new Set();
		const server = net.createServer((socket) => {
			sockets.add(socket);
			socket.on("close", () => sockets.delete(socket));
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		try {
			expect(
				await probeHttp(
					{ forward_scheme: "https", forward_host: "127.0.0.1", forward_port: server.address().port },
					{ path: "/health", expected_status: 200, timeout_ms: 500, skip_certificate_verification: true },
				),
			).toMatchObject({ state: "down", message: "Timed out during tls", status_code: null });
		} finally {
			for (const socket of sockets) socket.destroy();
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
