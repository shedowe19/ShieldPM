import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { Server as SshServer, utils } from "ssh2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

const state = vi.hoisted(() => ({ host: null, query: vi.fn(), decrypt: vi.fn((value) => value) }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: state.query } }));
vi.mock("../../lib/encryption.js", () => ({ decrypt: state.decrypt }));
vi.mock("../../lib/terminal-access.js", () => ({ isValidTerminalAccessToken: () => true }));
vi.mock("../../logger.js", () => ({ internal: {}, debug: vi.fn() }));

import terminal from "../../internal/terminal.js";

const keys = utils.generateKeyPairSync("ed25519");
const publicKey = utils.parseKey(keys.private).getPublicSSH();
const fingerprint = `SHA256:${createHash("sha256").update(publicKey).digest("base64").replace(/=+$/, "")}`;

describe("terminal SSH identity verification and shutdown with local sockets", () => {
	let http;
	let ssh;
	let browser;
	let authenticated;
	let connections;
	let messages;

	beforeEach(async () => {
		vi.clearAllMocks();
		authenticated = vi.fn();
		connections = new Set();
		messages = [];
		ssh = new SshServer({ hostKeys: [keys.private] }, (connection) => {
			connections.add(connection);
			connection.on("error", () => {});
			connection.on("close", () => connections.delete(connection));
			connection.on("authentication", (context) => {
				authenticated(context.method);
				if (context.method === "password" && context.password === "test-password") context.accept();
				else context.reject();
			});
			connection.on("ready", () => {
				connection.on("session", (accept) => {
					const session = accept();
					session.on("pty", (acceptPty) => acceptPty());
					session.on("shell", (acceptShell) => {
						const stream = acceptShell();
						stream.on("error", () => {});
					});
				});
			});
		});
		ssh.listen(0, "127.0.0.1");
		await once(ssh, "listening");
		state.host = {
			terminal_host: "127.0.0.1",
			terminal_port: ssh.address().port,
			terminal_host_fingerprint: fingerprint,
			terminal_username: "fixture",
			terminal_auth_type: "password",
			terminal_password: "test-password",
		};
		state.query.mockImplementation(() => ({
			findById: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			throwIfNotFound: async () => state.host,
		}));
		http = createServer();
		http.listen(0, "127.0.0.1");
		await once(http, "listening");
		terminal.init(http);
	});

	afterEach(async () => {
		browser?.terminate();
		browser = null;
		await terminal.stop();
		for (const connection of connections) connection.end();
		await Promise.all([
			new Promise((resolve) => http.close(resolve)),
			new Promise((resolve) => ssh.close(resolve)),
		]);
	});

	const open = async () => {
		browser = new WebSocket(`ws://127.0.0.1:${http.address().port}/nginx/proxy-hosts/7/terminal/ws`);
		browser.on("message", (data) => messages.push(JSON.parse(data.toString())));
		const closed = once(browser, "close");
		await once(browser, "open");
		return closed;
	};

	it("authenticates only after the stored OpenSSH fingerprint matches the real server key", async () => {
		// Do not await the close promise for a connection intended to stay open.
		const opened = open();
		await vi.waitFor(() => expect(messages).toContainEqual({ type: "status", status: "connected" }));
		expect(authenticated).toHaveBeenCalledWith("password");
		browser.close();
		await opened;
	});

	it("rejects a different server key before password authentication", async () => {
		state.host.terminal_host_fingerprint = `SHA256:${"A".repeat(43)}`;
		await open();
		expect(authenticated).not.toHaveBeenCalled();
		expect(messages).toContainEqual(
			expect.objectContaining({ type: "error", message: expect.stringContaining("fingerprint mismatch") }),
		);
	});

	it.each([null, "", "SHA256:invalid", `SHA256:${"A".repeat(43)}=`])(
		"requires a confirmed fingerprint before reading credentials or opening SSH: %s",
		async (pin) => {
			state.host.terminal_host_fingerprint = pin;
			const [code] = await open();
			expect(code).toBe(1008);
			expect(state.decrypt).not.toHaveBeenCalled();
			expect(connections.size).toBe(0);
			expect(authenticated).not.toHaveBeenCalled();
		},
	);

	it("closes active terminal sockets before HTTP shutdown and rejects late upgrades", async () => {
		const closed = open();
		await vi.waitFor(() => expect(messages).toContainEqual({ type: "status", status: "connected" }));
		const stopping = terminal.stop();
		const lateSocket = { destroy: vi.fn() };
		terminal.handleUpgrade({}, lateSocket, Buffer.alloc(0));
		expect(lateSocket.destroy).toHaveBeenCalledOnce();
		await stopping;
		expect((await closed)[0]).toBe(1001);
		await new Promise((resolve) => http.close(resolve));
		expect(http.listening).toBe(false);
		await vi.waitFor(() => expect(connections.size).toBe(0));
	});

	it("removes old upgrade listeners before initializing the same HTTP server again", async () => {
		await terminal.stop();
		expect(http.listenerCount("upgrade")).toBe(0);
		terminal.init(http);
		expect(http.listenerCount("upgrade")).toBe(1);
		const opened = open();
		await vi.waitFor(() => expect(messages).toContainEqual({ type: "status", status: "connected" }));
		browser.close();
		await opened;
	});
});
