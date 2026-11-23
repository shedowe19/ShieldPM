import { EventEmitter } from "node:events";
import http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), shell: vi.fn(), end: vi.fn(), ssh: null }));
vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "01".repeat(32) }));
vi.mock("../../lib/encryption.js", () => ({ decrypt: (value) => value }));
vi.mock("../../logger.js", () => ({ internal: {}, debug: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: mocks.query } }));
vi.mock("ssh2", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		Client: class extends EventEmitter {
			constructor() {
				super();
				mocks.ssh = this;
			}
			connect = mocks.connect;
			shell = mocks.shell;
			end = mocks.end;
		},
	};
});

import terminal from "../../internal/terminal.js";
import {
	consumeTerminalSessionToken,
	createTerminalSessionToken,
	getTerminalAccessToken,
	isAllowedTerminalOrigin,
	isValidTerminalAccessToken,
} from "../../lib/terminal-access.js";

const origin = "https://term.example.test";
const hostRow = (overrides = {}) => ({
	id: 7,
	terminal_host: "server",
	terminal_username: "user",
	domain_names: ["term.example.test"],
	...overrides,
});
const hostQuery = (host = hostRow()) => ({
	findById: vi.fn().mockReturnThis(),
	where: vi.fn().mockReturnThis(),
	withGraphJoined: vi.fn().mockReturnThis(),
	throwIfNotFound: async () => host,
});
const wsRequest = (token, extraHeaders = {}) => ({
	url: "/nginx/proxy-hosts/7/terminal/ws",
	headers: {
		origin,
		host: "term.example.test",
		"sec-websocket-protocol": `shieldpm-terminal, shieldpm-terminal.${token}`,
		...extraHeaders,
	},
});
const session = (hostId = 7, now = Date.now()) => createTerminalSessionToken(hostId, now);

describe("terminal access handoff and session tokens", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps the Nginx handoff token host-bound and rejects malformed values", () => {
		const token = getTerminalAccessToken(7);
		expect(isValidTerminalAccessToken("7", token)).toBe(true);
		for (const candidate of [undefined, "", token.slice(2), "f".repeat(64)])
			expect(isValidTerminalAccessToken(7, candidate)).toBe(false);
		expect(isValidTerminalAccessToken(8, token)).toBe(false);
	});

	it("issues short-lived tokens that are single-use and host-bound", () => {
		const now = Date.now();
		const token = session(7, now);
		expect(consumeTerminalSessionToken(7, token, now + 1000)).toBe(true);
		expect(consumeTerminalSessionToken(7, token, now + 1000)).toBe(false);
		expect(consumeTerminalSessionToken(8, session(7, now), now + 1000)).toBe(false);
		expect(consumeTerminalSessionToken(7, session(7, now), now + 6 * 60 * 1000)).toBe(false);
		expect(consumeTerminalSessionToken(7, session(7, now), now - 31_000)).toBe(false);
		expect(consumeTerminalSessionToken(7, "v2.invalid", now)).toBe(false);
	});

	it("only allows the host's own HTTPS origin or an explicitly configured origin", () => {
		expect(isAllowedTerminalOrigin(origin, { hostnames: ["term.example.test"] })).toBe(true);
		expect(isAllowedTerminalOrigin("https://other.example.test", { hostnames: ["term.example.test"] })).toBe(false);
		expect(isAllowedTerminalOrigin("http://term.example.test", { hostnames: ["term.example.test"] })).toBe(false);
		expect(isAllowedTerminalOrigin("https://term.example.test", { hostnames: [] })).toBe(false);
		expect(
			isAllowedTerminalOrigin("https://term.example.test", {
				hostnames: [],
				hostHeader: "term.example.test:443",
			}),
		).toBe(true);
		expect(
			isAllowedTerminalOrigin("https://user:pass@term.example.test", { hostnames: ["term.example.test"] }),
		).toBe(false);
	});

	it("rejects direct WebSockets without a session token before opening SSH", async () => {
		mocks.query.mockReturnValue(hostQuery());
		const ws = new EventEmitter();
		ws.close = vi.fn();
		await terminal.handleConnection(ws, {
			url: "/api/nginx/proxy-hosts/7/terminal/ws",
			headers: { origin, host: "term.example.test" },
		});
		expect(ws.close).toHaveBeenCalledWith(1008, "Unauthorized terminal connection");
		expect(mocks.connect).not.toHaveBeenCalled();
	});

	it("rejects a cross-origin session before consuming the token", async () => {
		mocks.query.mockReturnValue(hostQuery());
		const ws = new EventEmitter();
		ws.close = vi.fn();
		const token = session();
		await terminal.handleConnection(ws, wsRequest(token, { origin: "https://evil.example.test" }));
		expect(ws.close).toHaveBeenCalledWith(1008, "Unauthorized terminal origin");
		expect(consumeTerminalSessionToken(7, token)).toBe(true);
		expect(mocks.connect).not.toHaveBeenCalled();
	});

	it("mints a single-use session token only for the Nginx handoff and host origin", async () => {
		mocks.query.mockReturnValue(hostQuery());
		const server = http.createServer((_request, response) => {
			response.writeHead(418);
			response.end();
		});
		terminal.init(server);
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const port = server.address().port;
		const endpoint = `http://127.0.0.1:${port}/nginx/proxy-hosts/7/terminal/ws`;
		const headers = {
			host: "term.example.test",
			origin,
			"x-shieldpm-terminal-token": getTerminalAccessToken(7),
		};
		try {
			const response = await fetch(endpoint, { method: "POST", headers });
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(consumeTerminalSessionToken(7, body.token)).toBe(true);

			const rejected = await fetch(endpoint, {
				method: "POST",
				headers: { ...headers, origin: "https://evil.example.test" },
			});
			expect(rejected.status).toBe(403);
			const missingHandoff = await fetch(endpoint, {
				method: "POST",
				headers: { ...headers, "x-shieldpm-terminal-token": "f".repeat(64) },
			});
			expect(missingHandoff.status).toBe(403);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});

	it("requires an enabled host and passes terminal resize rows before columns", async () => {
		const where = vi.fn().mockReturnThis();
		mocks.query.mockReturnValue({
			findById: vi.fn().mockReturnThis(),
			where,
			withGraphJoined: vi.fn().mockReturnThis(),
			throwIfNotFound: async () => hostRow(),
		});
		const ws = new EventEmitter();
		ws.send = vi.fn();
		ws.close = vi.fn();
		const stream = new EventEmitter();
		stream.setWindow = vi.fn();
		stream.write = vi.fn();
		mocks.shell.mockImplementation((_options, callback) => callback(null, stream));
		await terminal.handleConnection(ws, wsRequest(session()));
		expect(where).toHaveBeenCalledWith("enabled", 1);
		mocks.ssh.emit("ready");
		ws.emit("message", JSON.stringify({ type: "resize", cols: 120, rows: 35 }));
		expect(stream.setWindow).toHaveBeenCalledWith(35, 120, 0, 0);
		ws.emit("message", JSON.stringify({ type: "resize", cols: -1, rows: 50000 }));
		expect(stream.setWindow).toHaveBeenCalledTimes(1);
	});

	it("does not open SSH when the WebSocket closes while the host query is pending", async () => {
		let resolveHost;
		mocks.query.mockReturnValue({
			findById: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			withGraphJoined: vi.fn().mockReturnThis(),
			throwIfNotFound: () =>
				new Promise((resolve) => {
					resolveHost = resolve;
				}),
		});
		const ws = new EventEmitter();
		ws.close = vi.fn();
		const pending = terminal.handleConnection(ws, wsRequest(session()));
		ws.emit("close");
		resolveHost(hostRow());
		await pending;
		expect(mocks.connect).not.toHaveBeenCalled();
	});

	it("handles protocol errors and keeps the first resize received during host lookup", async () => {
		let resolveHost;
		mocks.query.mockReturnValue({
			findById: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			withGraphJoined: vi.fn().mockReturnThis(),
			throwIfNotFound: () =>
				new Promise((resolve) => {
					resolveHost = resolve;
				}),
		});
		const ws = new EventEmitter();
		ws.close = vi.fn();
		ws.send = vi.fn();
		const pending = terminal.handleConnection(ws, wsRequest(session()));
		ws.emit("message", JSON.stringify({ type: "resize", cols: 140, rows: 42 }));
		resolveHost(hostRow());
		await pending;
		mocks.shell.mockImplementation(() => {});
		mocks.ssh.emit("ready");
		expect(mocks.shell).toHaveBeenCalledWith(
			expect.objectContaining({ cols: 140, rows: 42 }),
			expect.any(Function),
		);
		expect(() => ws.emit("error", new Error("Invalid UTF-8"))).not.toThrow();
		expect(mocks.end).toHaveBeenCalled();
	});
});
