import { EventEmitter } from "node:events";
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
import { getTerminalAccessToken, isValidTerminalAccessToken } from "../../lib/terminal-access.js";

describe("terminal Nginx access handoff", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	it("binds the handoff to its host and rejects malformed or absent tokens", () => {
		const token = getTerminalAccessToken(7);
		expect(isValidTerminalAccessToken("7", token)).toBe(true);
		for (const candidate of [undefined, "", token.slice(2), "f".repeat(64)])
			expect(isValidTerminalAccessToken(7, candidate)).toBe(false);
		expect(isValidTerminalAccessToken(8, token)).toBe(false);
	});
	it("rejects direct unauthenticated WebSockets before reading credentials", async () => {
		const ws = new EventEmitter();
		ws.close = vi.fn();
		await terminal.handleConnection(ws, { url: "/api/nginx/proxy-hosts/7/terminal/ws", headers: {} });
		expect(ws.close).toHaveBeenCalledWith(1008, "Unauthorized terminal connection");
		expect(mocks.query).not.toHaveBeenCalled();
		expect(mocks.connect).not.toHaveBeenCalled();
	});
	it("requires an enabled host and passes terminal resize rows before columns", async () => {
		const where = vi.fn().mockReturnThis();
		mocks.query.mockReturnValue({
			findById: vi.fn().mockReturnThis(),
			where,
			throwIfNotFound: async () => ({ terminal_host: "server", terminal_username: "user" }),
		});
		const ws = new EventEmitter();
		ws.send = vi.fn();
		ws.close = vi.fn();
		const stream = new EventEmitter();
		stream.setWindow = vi.fn();
		stream.write = vi.fn();
		mocks.shell.mockImplementation((_options, callback) => callback(null, stream));
		await terminal.handleConnection(ws, {
			url: "/nginx/proxy-hosts/7/terminal/ws",
			headers: { "x-shieldpm-terminal-token": getTerminalAccessToken(7) },
		});
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
			throwIfNotFound: () =>
				new Promise((resolve) => {
					resolveHost = resolve;
				}),
		});
		const ws = new EventEmitter();
		ws.close = vi.fn();
		const pending = terminal.handleConnection(ws, {
			url: "/nginx/proxy-hosts/7/terminal/ws",
			headers: { "x-shieldpm-terminal-token": getTerminalAccessToken(7) },
		});
		ws.emit("close");
		resolveHost({ terminal_host: "server", terminal_username: "user" });
		await pending;
		expect(mocks.connect).not.toHaveBeenCalled();
	});
	it("handles protocol errors and keeps the first resize received during host lookup", async () => {
		let resolveHost;
		mocks.query.mockReturnValue({
			findById: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			throwIfNotFound: () =>
				new Promise((resolve) => {
					resolveHost = resolve;
				}),
		});
		const ws = new EventEmitter();
		ws.close = vi.fn();
		ws.send = vi.fn();
		const pending = terminal.handleConnection(ws, {
			url: "/nginx/proxy-hosts/7/terminal/ws",
			headers: { "x-shieldpm-terminal-token": getTerminalAccessToken(7) },
		});
		ws.emit("message", JSON.stringify({ type: "resize", cols: 140, rows: 42 }));
		resolveHost({ terminal_host: "server", terminal_username: "user" });
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
