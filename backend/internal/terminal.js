import { StringDecoder } from "node:string_decoder";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import { decrypt } from "../lib/encryption.js";
import { AUDIT_ACTION } from "../lib/security-events.js";
import {
	consumeTerminalSessionToken,
	createTerminalSessionToken,
	isAllowedTerminalOrigin,
	isValidTerminalAccessToken,
	TERMINAL_SESSION_TTL_MS,
} from "../lib/terminal-access.js";
import { debug, internal as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";

const TOKEN_PROTOCOL_PREFIX = "shieldpm-terminal.";
const SESSION_PROTOCOL = "shieldpm-terminal";
const configuredOrigins = () =>
	(process.env.TERMINAL_ALLOWED_ORIGINS || "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);

const terminalPath = (request) => {
	const raw = typeof request.url === "string" ? request.url : "";
	const [pathname, query = ""] = raw.split("?");
	const match = /^\/(?:api\/)?nginx\/proxy-hosts\/(\d+)\/terminal\/ws$/.exec(pathname);
	if (match) return { hostId: match[1], pathname };
	const legacy = /^\/(?:api\/)?nginx\/terminal\/ws$/.exec(pathname);
	if (!legacy) return null;
	const hostId = new URLSearchParams(query).get("id");
	return /^\d+$/.test(hostId || "") ? { hostId, pathname } : null;
};

const requestProtocols = (request) =>
	String(request.headers?.["sec-websocket-protocol"] || "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);

const sessionToken = (request) => {
	const protocol = requestProtocols(request).find((value) => value.startsWith(TOKEN_PROTOCOL_PREFIX));
	return protocol ? protocol.slice(TOKEN_PROTOCOL_PREFIX.length) : "";
};

const hostNames = (host) => {
	const names = host?.host_domains?.map(({ domain_name }) => domain_name);
	if (Array.isArray(names) && names.length) return names;
	return Array.isArray(host?.domain_names) ? host.domain_names : [];
};

const originAllowed = (request, host) => {
	const origin = request.headers?.origin;
	if (typeof origin !== "string" || !origin) return false;
	if (configuredOrigins().includes(origin)) return true;
	return isAllowedTerminalOrigin(origin, {
		hostnames: hostNames(host),
		hostHeader: request.headers?.host,
		allowHttp: process.env.TERMINAL_ALLOW_HTTP_ORIGIN === "true",
	});
};

/**
 * Terminal connections bypass Express, so the audit entry carries its own
 * request context. The SSH host credentials and every byte of terminal output
 * stay out of the audit trail.
 *
 * @param {string} action
 * @param {import("node:http").IncomingMessage} request
 * @param {number | string | null} hostId
 * @param {string} outcome
 * @param {Record<string, any>} [meta]
 */
const auditTerminal = async (action, request, hostId, outcome, meta = {}) => {
	try {
		const { default: internalAuditLog } = await import("./audit-log.js");
		const forwarded = request?.headers?.["x-forwarded-for"];
		await internalAuditLog.add(null, {
			action,
			object_type: "terminal-host",
			object_id: Number(hostId) || 0,
			user_id: 0,
			actor_type: "system",
			outcome,
			ip: request?.socket?.remoteAddress || null,
			user_agent: typeof request?.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : null,
			meta: {
				...meta,
				forwarded_for: Array.isArray(forwarded) ? forwarded[0] : forwarded || null,
			},
		});
	} catch (error) {
		logger.error?.(`[Terminal] Could not audit ${action}: ${error?.message}`);
	}
};

const rejectUpgrade = (socket, status = 403) => {
	if (socket.writable) {
		socket.write(
			`HTTP/1.1 ${status} ${status === 403 ? "Forbidden" : "Bad Request"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
		);
	}
	socket.destroy();
};

const findTerminalHost = (hostId) =>
	ProxyHost.query()
		.findById(hostId)
		.where("forward_scheme", "terminal")
		.where("is_deleted", 0)
		.where("enabled", 1)
		.withGraphJoined("host_domains")
		.throwIfNotFound();

const internalTerminal = {
	wss: null,
	servers: new WeakSet(),
	requestHooks: new WeakSet(),

	init: (server) => {
		if (!internalTerminal.servers.has(server)) {
			internalTerminal.wss = new WebSocketServer({
				noServer: true,
				maxPayload: 64 * 1024,
				// The token travels in the subprotocol list; never echo it in the handshake.
				handleProtocols: (protocols) => (protocols.has(SESSION_PROTOCOL) ? SESSION_PROTOCOL : false),
			});
			internalTerminal.servers.add(server);

			server.on("upgrade", (request, socket, head) => {
				if (!terminalPath(request)) return;
				const protocols = requestProtocols(request);
				if (
					!request.headers?.origin ||
					!protocols.includes(SESSION_PROTOCOL) ||
					!protocols.some((value) => value.startsWith(TOKEN_PROTOCOL_PREFIX))
				) {
					rejectUpgrade(socket);
					return;
				}
				internalTerminal.handleUpgrade(request, socket, head);
			});

			internalTerminal.wss.on("connection", internalTerminal.handleConnection);
		}

		// A normal POST to /ws mints a one-time session token. The request still
		// passes through the published host and its access list; Express handles
		// every other request unchanged.
		if (!internalTerminal.requestHooks.has(server)) {
			const handlers = server.listeners("request");
			if (handlers.length) {
				server.removeAllListeners("request");
				server.on("request", (request, response) => {
					if (request.method === "POST" && terminalPath(request)) {
						internalTerminal.handleTokenRequest(request, response).catch((error) => {
							debug(logger, `Terminal token request failed: ${error.message}`);
							if (!response.headersSent) response.writeHead(500, { "Cache-Control": "no-store" });
							response.end();
						});
						return;
					}
					for (const handler of handlers) handler.call(server, request, response);
				});
				internalTerminal.requestHooks.add(server);
			}
		}

		debug(logger, "WebSocket Server for Terminal initialized");
	},

	handleUpgrade: (request, socket, head) => {
		internalTerminal.wss.handleUpgrade(request, socket, head, (ws) => {
			internalTerminal.wss.emit("connection", ws, request);
		});
	},

	handleTokenRequest: async (request, response) => {
		request.resume();
		const parsed = terminalPath(request);
		if (!parsed) {
			response.writeHead(404, { "Cache-Control": "no-store" });
			response.end();
			return;
		}
		if (request.headers["content-length"] && Number(request.headers["content-length"]) > 0) {
			response.writeHead(413, { "Cache-Control": "no-store" });
			response.end();
			return;
		}
		const fetchSite = request.headers["sec-fetch-site"];
		if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
			response.writeHead(403, { "Cache-Control": "no-store" });
			response.end();
			return;
		}
		if (!isValidTerminalAccessToken(parsed.hostId, request.headers["x-shieldpm-terminal-token"])) {
			response.writeHead(403, { "Cache-Control": "no-store" });
			response.end();
			return;
		}
		let host;
		try {
			host = await findTerminalHost(parsed.hostId);
		} catch {
			response.writeHead(404, { "Cache-Control": "no-store" });
			response.end();
			return;
		}
		if (!originAllowed(request, host)) {
			response.writeHead(403, { "Cache-Control": "no-store" });
			response.end();
			return;
		}
		const body = JSON.stringify({
			token: createTerminalSessionToken(host.id),
			expires_in: Math.floor(TERMINAL_SESSION_TTL_MS / 1000),
		});
		response.writeHead(200, {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Length": Buffer.byteLength(body),
			"Cache-Control": "no-store, max-age=0",
			Pragma: "no-cache",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "default-src 'none'",
			"Referrer-Policy": "no-referrer",
		});
		response.end(body);
	},

	handleConnection: async (ws, request) => {
		// Protocol errors are emitted even while an unauthenticated socket is closing.
		ws.on("error", () => ws.close());
		const parsed = terminalPath(request);
		if (!parsed) {
			ws.close(1008, "Host ID required");
			return;
		}
		const hostId = parsed.hostId;

		let sshClient = null;
		let initialCols = 80;
		let initialRows = 24;
		let sshStream = null;
		let disconnected = false;
		let openedAt = null;
		let closedAudited = false;
		const disconnect = () => {
			if (openedAt && !closedAudited) {
				closedAudited = true;
				auditTerminal(AUDIT_ACTION.TERMINAL_CLOSED, request, hostId, "success", {
					duration_ms: Date.now() - openedAt,
				});
			}
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

		let host;
		try {
			host = await findTerminalHost(hostId);
		} catch (_err) {
			auditTerminal(AUDIT_ACTION.TERMINAL_DENIED, request, hostId, "denied", { reason: "host_unavailable" });
			ws.close(1008, "Terminal host not found");
			return;
		}

		if (!originAllowed(request, host)) {
			auditTerminal(AUDIT_ACTION.TERMINAL_DENIED, request, hostId, "denied", { reason: "origin" });
			ws.close(1008, "Unauthorized terminal origin");
			return;
		}
		if (!consumeTerminalSessionToken(hostId, sessionToken(request))) {
			auditTerminal(AUDIT_ACTION.TERMINAL_DENIED, request, hostId, "denied", { reason: "session_token" });
			ws.close(1008, "Unauthorized terminal connection");
			return;
		}
		if (disconnected) return;

		sshClient = new Client();

		sshClient.on("ready", () => {
			if (disconnected) return;
			openedAt = Date.now();
			auditTerminal(AUDIT_ACTION.TERMINAL_OPENED, request, hostId, "success", {
				host_name: hostNames(host)[0] || null,
				auth_type: host.terminal_auth_type || null,
			});
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
			auditTerminal(AUDIT_ACTION.TERMINAL_DENIED, request, hostId, "denied", { reason: "ssh_error" });
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
