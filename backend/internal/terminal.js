import { createHash, timingSafeEqual } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { decrypt } from "../lib/encryption.js";
import { isValidTerminalAccessToken } from "../lib/terminal-access.js";
import { debug, internal as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";

const internalTerminal = {
	wss: null,
	servers: new Map(),
	sessions: new Set(),
	stopping: false,
	stopPromise: null,

	init: (server) => {
		if (internalTerminal.servers.has(server)) return;
		internalTerminal.stopping = false;
		internalTerminal.stopPromise = null;
		const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
		internalTerminal.wss = wss;

		const onUpgrade = (request, socket, head) => {
			const pathname = request.url;

			// Check for terminal WebSocket paths:
			// - /api/nginx/proxy-hosts/:id/terminal/ws (via API)
			// - /nginx/proxy-hosts/:id/terminal/ws (after Nginx strips /api)
			// - /api/nginx/terminal/ws?id=:id (legacy standalone - deprecated)
			// - /nginx/terminal/ws?id=:id (legacy standalone - deprecated)
			if (
				pathname.match(/^\/(?:api\/)?nginx\/proxy-hosts\/\d+\/terminal\/ws/) ||
				pathname.match(/^\/(?:api\/)?nginx\/terminal\/ws/)
			) {
				internalTerminal.handleUpgrade(request, socket, head, wss);
			}
		};
		server.on("upgrade", onUpgrade);
		internalTerminal.servers.set(server, { wss, onUpgrade });

		wss.on("connection", internalTerminal.handleConnection);
		debug(logger, "WebSocket Server for Terminal initialized");
	},

	/** Stop accepting terminal upgrades and bound the lifetime of existing SSH/WebSocket connections. */
	stop: () => {
		if (internalTerminal.stopPromise) return internalTerminal.stopPromise;
		internalTerminal.stopping = true;
		const sessions = [...internalTerminal.sessions];
		for (const session of sessions) session.close();
		const servers = [...internalTerminal.servers.values()].map(({ wss }) => wss);
		internalTerminal.stopPromise = (async () => {
			let deadline;
			const closed = Promise.all(
				servers.map((wss) => new Promise((resolve) => wss.close(() => resolve(undefined)))),
			);
			const timeout = new Promise((resolve) => {
				deadline = setTimeout(resolve, 1000);
			});
			for (const wss of servers) {
				for (const ws of wss.clients) ws.close(1001, "Backend shutting down");
			}
			await Promise.race([closed, timeout]);
			clearTimeout(deadline);
			// An SSH handshake or unresponsive browser must not retain the HTTP shutdown callback.
			for (const session of sessions) session.destroy();
			for (const wss of servers) {
				for (const ws of wss.clients) ws.terminate();
			}
			for (const [server, { onUpgrade }] of internalTerminal.servers) {
				server.removeListener("upgrade", onUpgrade);
			}
			internalTerminal.servers.clear();
			internalTerminal.sessions.clear();
			internalTerminal.wss = null;
		})();
		return internalTerminal.stopPromise;
	},

	handleUpgrade: (request, socket, head, wss = internalTerminal.wss) => {
		if (internalTerminal.stopping || !wss) {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit("connection", ws, request);
		});
	},

	handleConnection: async (ws, request) => {
		// Protocol errors are emitted even while an unauthenticated socket is closing.
		ws.on("error", () => ws.close());
		if (internalTerminal.stopping) {
			ws.close(1001, "Backend shutting down");
			return;
		}
		let hostId = null;

		// Parse host ID from URL path or query params
		// New format: /nginx/proxy-hosts/123/terminal/ws
		const pathMatch = request.url.match(/\/proxy-hosts\/(\d+)\/terminal\/ws/);
		if (pathMatch) {
			hostId = pathMatch[1];
		} else {
			// Legacy format: /nginx/terminal/ws?id=123
			const urlParams = new URLSearchParams(request.url.split("?")[1]);
			hostId = urlParams.get("id");
		}

		if (!hostId) {
			ws.close(1008, "Host ID required");
			return;
		}

		if (!isValidTerminalAccessToken(hostId, request.headers?.["x-shieldpm-terminal-token"])) {
			ws.close(1008, "Unauthorized terminal connection");
			return;
		}

		let sshClient = null;
		let initialCols = 80;
		let initialRows = 24;
		let sshStream = null;
		let disconnected = false;
		const disconnect = () => {
			disconnected = true;
			sshStream?.end();
			sshClient?.end();
		};
		const session = {
			close: () => {
				disconnect();
				ws.close(1001, "Backend shutting down");
			},
			destroy: () => sshClient?.destroy(),
		};
		internalTerminal.sessions.add(session);
		// Register before database access: a browser may disconnect or send its size while it is pending.
		ws.on("close", () => {
			disconnect();
			internalTerminal.sessions.delete(session);
		});
		ws.on("error", disconnect);
		// Listen for messages early to capture initial resize from frontend
		ws.on("message", (data) => {
			try {
				const msg = JSON.parse(data);
				if (msg.type === "resize") {
					if (
						!Number.isInteger(msg.cols) ||
						!Number.isInteger(msg.rows) ||
						msg.cols < 1 ||
						msg.cols > 1000 ||
						msg.rows < 1 ||
						msg.rows > 1000
					)
						return;
					initialCols = msg.cols;
					initialRows = msg.rows;
					if (sshStream) {
						sshStream.setWindow(msg.rows, msg.cols, 0, 0);
					}
				} else if (msg.type === "data" && typeof msg.data === "string" && sshStream) {
					sshStream.write(msg.data);
				}
			} catch (_e) {
				// Ignore parse errors
			}
		});

		// Get Host Credentials from ProxyHost (forward_scheme: 'terminal')
		let host;
		try {
			host = await ProxyHost.query()
				.findById(hostId)
				.where("forward_scheme", "terminal")
				.where("is_deleted", 0)
				.where("enabled", 1)
				.throwIfNotFound();
		} catch (_err) {
			ws.close(1008, "Terminal host not found");
			return;
		}

		if (disconnected) return;
		if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(host.terminal_host_fingerprint || "")) {
			ws.send(
				JSON.stringify({
					type: "error",
					message: "Configure and independently verify the SSH server SHA256 fingerprint before connecting.",
				}),
			);
			ws.close(1008, "SSH server fingerprint required");
			return;
		}
		sshClient = new Client();

		sshClient.on("ready", () => {
			if (disconnected) return;
			ws.send(JSON.stringify({ type: "status", status: "connected" }));

			sshClient.shell({ term: "xterm-256color", cols: initialCols, rows: initialRows }, (err, stream) => {
				if (err) {
					ws.send(JSON.stringify({ type: "error", message: `Shell error: ${err.message}` }));
					ws.close();
					return;
				}

				if (disconnected) {
					stream.end();
					return;
				}
				sshStream = stream;
				stream.on("error", () => {
					disconnect();
					ws.close();
				});
				const decoder = new StringDecoder("utf8");

				// Forward data SSH -> WS
				stream.on("data", (d) => {
					ws.send(JSON.stringify({ type: "data", data: decoder.write(d) }));
				});

				stream.on("close", () => {
					ws.close();
					sshClient.end();
				});
			});
		});

		sshClient.on("error", (err) => {
			ws.send(JSON.stringify({ type: "error", message: `SSH Error: ${err.message}` }));
			ws.close();
		});

		sshClient.on("close", () => {
			ws.close();
		});

		// Decrypt password/key from ProxyHost terminal_* fields
		const config = {
			host: host.terminal_host,
			port: host.terminal_port || 22,
			username: host.terminal_username,
			hostVerifier: (key) => {
				const actual = `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
				const expected = host.terminal_host_fingerprint;
				const verified =
					actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
				if (!verified && !disconnected) {
					ws.send(
						JSON.stringify({
							type: "error",
							message:
								"SSH server fingerprint mismatch. Verify the server key independently before updating the saved fingerprint.",
						}),
					);
				}
				return verified;
			},
		};

		try {
			if (host.terminal_auth_type === "password" && host.terminal_password) {
				config.password = decrypt(host.terminal_password);
			} else if (host.terminal_auth_type === "key" && host.terminal_private_key) {
				config.privateKey = decrypt(host.terminal_private_key);
			}
			sshClient.connect(config);
		} catch (err) {
			ws.send(JSON.stringify({ type: "error", message: `Connection Failed: ${err.message}` }));
			ws.close();
		}
	},
};

export default internalTerminal;
