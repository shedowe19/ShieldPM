import { StringDecoder } from "node:string_decoder";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { decrypt } from "../lib/encryption.js";
import { isValidTerminalAccessToken } from "../lib/terminal-access.js";
import { debug, internal as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";

const internalTerminal = {
	wss: null,
	servers: new WeakSet(),

	init: (server) => {
		if (internalTerminal.servers.has(server)) return;
		internalTerminal.wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
		internalTerminal.servers.add(server);

		server.on("upgrade", (request, socket, head) => {
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
				internalTerminal.handleUpgrade(request, socket, head);
			}
		});

		internalTerminal.wss.on("connection", internalTerminal.handleConnection);
		debug(logger, "WebSocket Server for Terminal initialized");
	},

	handleUpgrade: (request, socket, head) => {
		internalTerminal.wss.handleUpgrade(request, socket, head, (ws) => {
			internalTerminal.wss.emit("connection", ws, request);
		});
	},

	handleConnection: async (ws, request) => {
		// Protocol errors are emitted even while an unauthenticated socket is closing.
		ws.on("error", () => ws.close());
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
			sshClient?.end();
		};
		// Register before database access: a browser may disconnect or send its size while it is pending.
		ws.on("close", disconnect);
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
