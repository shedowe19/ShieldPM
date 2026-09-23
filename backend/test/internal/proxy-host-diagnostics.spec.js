import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../internal/proxy-host.js", () => ({ default: { get: vi.fn() } }));

import internalProxyHost from "../../internal/proxy-host.js";
import diagnostics, { validateWebsocketPath } from "../../internal/proxy-host-diagnostics.js";
import errs from "../../lib/error.js";
import apiValidator from "../../lib/validator/api.js";
import schema from "../../schema/paths/nginx/proxy-hosts/hostID/diagnostics/post.json" with { type: "json" };

const open = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const close = (server) => new Promise((resolve) => server.close(resolve));
const check = (diagnosis, key) => diagnosis.checks.find((entry) => entry.key === key);

describe("proxy host diagnostics", () => {
	let listener;
	let upstream;
	let upgradeRequests;
	const access = { token: { getUserId: () => 2 } };

	beforeEach(async () => {
		upgradeRequests = [];
		upstream = net.createServer((socket) => socket.end());
		listener = http.createServer((req, res) => {
			res.writeHead(req.method === "HEAD" ? 302 : 401, { Location: "/login" });
			res.end();
		});
		listener.on("upgrade", (req, socket) => {
			upgradeRequests.push(req);
			socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
		});
		await Promise.all([open(listener), open(upstream)]);
		vi.stubEnv("HTTP_PORT", String(listener.address().port));
		vi.stubEnv("IPV4_BINDING", "127.0.0.1");
		vi.stubEnv("DISABLE_HTTP", "false");
		vi.stubEnv("LISTEN_PROXY_PROTOCOL", "false");
		vi.mocked(internalProxyHost.get).mockResolvedValue({
			id: 7,
			domain_names: ["localhost"],
			forward_scheme: "http",
			forward_host: "127.0.0.1",
			forward_port: upstream.address().port,
			enabled: true,
			certificate_id: 0,
			access_list_id: 3,
			allow_websocket_upgrade: true,
		});
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
		await Promise.all([close(listener), close(upstream)]);
	});

	it("distinguishes a reachable upstream from the protected local route without forwarding credentials", async () => {
		const result = await diagnostics.diagnose(access, { id: 7, url: "http://unrelated.invalid" });
		expect(internalProxyHost.get).toHaveBeenCalledWith(access, { id: 7, expand: ["access_list", "host_domains"] });
		expect(result.hostId).toBe(7);
		expect(result.checks.map(({ key }) => key)).toEqual(["dns", "tls", "route", "upstream", "auth", "websocket"]);
		expect(check(result, "route")).toMatchObject({ status: "pass", message: "route.redirect", detail: "302" });
		expect(check(result, "upstream")).toMatchObject({ status: "pass", message: "upstream.connected" });
		expect(check(result, "auth")).toMatchObject({ status: "pass", message: "auth.challenge" });
		expect(check(result, "websocket")).toMatchObject({ status: "warn", message: "websocket.authProtected" });
	});

	it("probes the actual upstream host when forward_host includes an Nginx base path", async () => {
		const host = await internalProxyHost.get();
		vi.mocked(internalProxyHost.get).mockResolvedValueOnce({
			...host,
			forward_host: "127.0.0.1/base/path",
		});
		const result = await diagnostics.diagnose(access, { id: 7 });
		expect(check(result, "upstream")).toMatchObject({ status: "pass", message: "upstream.connected" });
	});

	it("probes a terminal host's dedicated SSH target", async () => {
		const host = await internalProxyHost.get();
		vi.mocked(internalProxyHost.get).mockResolvedValueOnce({
			...host,
			forward_scheme: "terminal",
			forward_host: "unrelated.invalid",
			terminal_host: "127.0.0.1",
			terminal_port: upstream.address().port,
		});
		const result = await diagnostics.diagnose(access, { id: 7 });
		expect(check(result, "upstream")).toMatchObject({ status: "pass", message: "upstream.connected" });
	});

	it("does not probe a host when the existing per-host authorization rejects it", async () => {
		vi.mocked(internalProxyHost.get).mockRejectedValueOnce(new errs.PermissionError());
		await expect(diagnostics.diagnose(access, { id: 7 })).rejects.toBeInstanceOf(errs.PermissionError);
	});

	it("probes a chosen path on the same authorized host without cookies or Authorization", async () => {
		const result = await diagnostics.diagnose(access, { id: 7, websocket_path: "/api/ws" });
		expect(check(result, "websocket")).toMatchObject({ message: "websocket.authProtected", detail: "401" });
		expect(upgradeRequests).toHaveLength(1);
		expect(upgradeRequests[0].url).toBe("/api/ws");
		expect(upgradeRequests[0].headers.host).toBe("localhost");
		expect(upgradeRequests[0].headers.cookie).toBeUndefined();
		expect(upgradeRequests[0].headers.authorization).toBeUndefined();
	});

	it.each([
		"https://other.invalid/ws",
		"//other.invalid/ws",
		"/a%2fadmin",
		"/a?token=abc",
		"/a#frag",
		"/../secret",
		"/ok\r\nHost:other.invalid",
		`/${"x".repeat(256)}`,
	])("rejects unsafe WebSocket path %s before any network probe", async (path) => {
		expect(() => validateWebsocketPath(path)).toThrow(errs.ValidationError);
		const payload = schema.requestBody.content["application/json"].schema;
		// OpenAPI handles malformed syntax; the service also catches dot segments.
		if (path !== "/../secret")
			await expect(apiValidator(payload, { websocket_path: path })).rejects.toBeInstanceOf(errs.ValidationError);
		await expect(diagnostics.diagnose(access, { id: 7, websocket_path: path })).rejects.toBeInstanceOf(
			errs.ValidationError,
		);
		expect(upgradeRequests).toHaveLength(0);
	});

	it("marks the route as failed even when the upstream accepts connections", async () => {
		listener.removeAllListeners("request");
		listener.on("request", (_req, res) => {
			res.writeHead(502);
			res.end();
		});
		const result = await diagnostics.diagnose(access, { id: 7 });
		expect(check(result, "route")).toMatchObject({ status: "fail", message: "route.serverError", detail: "502" });
		expect(check(result, "upstream").status).toBe("pass");
		expect(check(result, "auth").status).toBe("skip");
	});

	it("does not classify an allowlisted local 200 response as an auth failure", async () => {
		listener.removeAllListeners("request");
		listener.on("request", (_req, res) => {
			res.writeHead(200);
			res.end();
		});
		const result = await diagnostics.diagnose(access, { id: 7 });
		expect(check(result, "route").status).toBe("pass");
		expect(check(result, "auth")).toMatchObject({ status: "skip", message: "auth.indeterminate" });
	});

	it.skipIf(spawnSync("openssl", ["version"]).status !== 0)(
		"checks local HTTPS certificate and preserves an expected SSO redirect",
		async () => {
			const certDir = mkdtempSync(join(tmpdir(), "shieldpm-diagnostics-"));
			let secureListener;
			try {
				spawnSync(
					"openssl",
					[
						"req",
						"-x509",
						"-nodes",
						"-newkey",
						"rsa:2048",
						"-keyout",
						join(certDir, "key.pem"),
						"-out",
						join(certDir, "cert.pem"),
						"-days",
						"2",
						"-subj",
						"/CN=localhost",
						"-addext",
						"subjectAltName=DNS:localhost",
					],
					{ stdio: "ignore" },
				);
				secureListener = https.createServer(
					{
						key: readFileSync(join(certDir, "key.pem")),
						cert: readFileSync(join(certDir, "cert.pem")),
					},
					(_req, res) => {
						res.writeHead(302, { Location: "/signin" });
						res.end();
					},
				);
				secureListener.on("upgrade", (_req, socket) =>
					socket.end("HTTP/1.1 302 Found\r\nLocation: /signin\r\nConnection: close\r\n\r\n"),
				);
				await open(secureListener);
				vi.stubEnv("HTTPS_PORT", String(secureListener.address().port));
				const host = await internalProxyHost.get();
				vi.mocked(internalProxyHost.get).mockResolvedValueOnce({
					...host,
					certificate_id: 4,
					ssl_forced: true,
				});
				const result = await diagnostics.diagnose(access, { id: 7 });
				expect(check(result, "tls")).toMatchObject({ status: "warn", message: "tls.untrusted" });
				expect(check(result, "route")).toMatchObject({
					status: "pass",
					message: "route.redirect",
					detail: "302",
				});
				expect(check(result, "auth")).toMatchObject({ status: "pass", message: "auth.challenge" });
			} finally {
				if (secureListener?.listening) await close(secureListener);
				rmSync(certDir, { recursive: true, force: true });
			}
		},
	);

	it("skips the local route and WebSocket request for disabled hosts", async () => {
		vi.mocked(internalProxyHost.get).mockResolvedValueOnce({
			id: 7,
			domain_names: ["*.example.org"],
			forward_scheme: "path",
			enabled: false,
			certificate_id: 0,
			access_list_id: 0,
			allow_websocket_upgrade: true,
		});
		const result = await diagnostics.diagnose(access, { id: 7 });
		expect(result.domain).toBeNull();
		expect(check(result, "dns").message).toBe("dns.noExactDomain");
		expect(check(result, "route").message).toBe("host.disabled");
		expect(check(result, "websocket").message).toBe("host.disabled");
		expect(check(result, "upstream").status).toBe("skip");
	});
});
