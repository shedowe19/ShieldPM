import crypto from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { Client } from "ssh2";
import { WebSocket, WebSocketServer } from "ws";
import { decrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { debug, internal as logger } from "../logger.js";
import AccessList from "../models/access_list.js";
import Certificate from "../models/certificate.js";
import ProxyHost from "../models/proxy_host.js";

const TICKET_TTL_MS = 30_000;
const GATEWAY_CLOCK_SKEW_SECONDS = 15;
const MAX_TICKETS = 1000;
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_BUFFERED_OUTPUT_BYTES = 1024 * 1024;
const MAX_COLS = 500;
const MAX_ROWS = 200;
const CLIENT_FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HOST_KEY_FINGERPRINT_PATTERN = /^(?:SHA256:[A-Za-z0-9+/]{43}=?|[A-Fa-f0-9]{64})$/;
const TERMINAL_PROTOCOL = "shieldpm-terminal";
const TERMINAL_PATH_PATTERN = /^\/(?:api\/)?nginx\/proxy-hosts\/(\d+)\/terminal\/ws$/;
const authenticatedAccessTypes = new Set(["authentik_proxy", "oauth2_proxy"]);

const tickets = new Map();
const activeSessions = new Set();
const pendingConnections = new WeakMap();

const hasControlCharacters = (value) =>
	Array.from(value).some((character) => {
		const codePoint = character.codePointAt(0);
		return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
	});

const safeEqual = (left, right) => {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const normalizeAuthority = (authority) => {
	if (
		typeof authority !== "string" ||
		!authority ||
		authority.length > 255 ||
		hasControlCharacters(authority) ||
		/[\s@/?#\\]/.test(authority)
	) {
		throw new errs.UnauthorizedError("Invalid terminal authority");
	}
	return authority.toLowerCase();
};

const authorityHostname = (authority) => {
	try {
		return new URL(`https://${authority}`).hostname.toLowerCase();
	} catch (error) {
		throw new errs.UnauthorizedError("Invalid terminal authority", error);
	}
};

const authorityMatchesHost = (host, authority) => {
	const hostname = authorityHostname(authority);
	return (host.domain_names || []).some((domain) => {
		const normalized = String(domain).toLowerCase();
		return normalized === hostname || (normalized.startsWith("*.") && hostname.endsWith(normalized.slice(1)));
	});
};

const getAccessRevision = (host) => Number.parseInt(host.access_list?.revision, 10) || 1;

const hasAuthenticatedAccessList = (accessList) => {
	if (!accessList || accessList.is_deleted) return false;
	const authType = accessList.meta?.auth_type || accessList.meta?.authType;
	const clientsCanBypassAuth = Boolean(accessList.satisfy_any && accessList.clients?.length);
	const hasPasswordUsers = Array.isArray(accessList.items) && accessList.items.length > 0 && !clientsCanBypassAuth;
	const hasMtls = Boolean(accessList.mtls_enabled && (accessList.mtls_use_internal || accessList.mtls_certificate));
	const hasExternalAuth = authenticatedAccessTypes.has(authType) && !clientsCanBypassAuth;
	return hasPasswordUsers || hasMtls || hasExternalAuth;
};

/**
 * Fail closed unless the terminal is HTTPS-only, certificate-backed, ACL-authenticated and host-key pinned.
 * @param {ProxyHost} host
 * @returns {void}
 */
const assertSecureHost = (host) => {
	if (host?.forward_scheme !== "terminal" || host.is_deleted || !host.enabled) {
		throw new errs.ItemNotFoundError("Terminal host");
	}
	if (!host.ssl_forced || !host.certificate_id || !host.certificate) {
		throw new errs.ConfigurationError("Terminal hosts require forced TLS and a valid certificate");
	}
	if (!host.access_list_id || !hasAuthenticatedAccessList(host.access_list)) {
		throw new errs.ConfigurationError("Terminal hosts require an authenticated access list");
	}
	if (!HOST_KEY_FINGERPRINT_PATTERN.test(host.terminal_host_key_fingerprint || "")) {
		throw new errs.ConfigurationError("Terminal SSH host-key fingerprint is missing or invalid");
	}
	if (!host.terminal_gateway_secret) {
		throw new errs.ConfigurationError("Terminal gateway secret is missing");
	}
};

const validateHostConfiguration = async (data, options = {}) => {
	if (data.forward_scheme !== "terminal") return;
	const certificateId = Number.parseInt(data.certificate_id, 10);
	const accessListId = Number.parseInt(data.access_list_id, 10);
	if (!data.ssl_forced) {
		throw new errs.ValidationError("Terminal hosts require Force SSL");
	}
	if (!options.allowNewCertificate && (!Number.isInteger(certificateId) || certificateId < 1)) {
		throw new errs.ValidationError("Terminal hosts require a certificate");
	}
	if (!Number.isInteger(accessListId) || accessListId < 1) {
		throw new errs.ValidationError("Terminal hosts require an authenticated access list");
	}
	if (!HOST_KEY_FINGERPRINT_PATTERN.test(data.terminal_host_key_fingerprint || "")) {
		throw new errs.ValidationError("A valid SSH host-key fingerprint is required for terminal hosts");
	}
	if (
		typeof data.terminal_host !== "string" ||
		!data.terminal_host ||
		data.terminal_host.length > 253 ||
		hasControlCharacters(data.terminal_host) ||
		/\s/.test(data.terminal_host) ||
		typeof data.terminal_username !== "string" ||
		!data.terminal_username ||
		data.terminal_username.length > 255 ||
		hasControlCharacters(data.terminal_username) ||
		!["password", "key"].includes(data.terminal_auth_type)
	) {
		throw new errs.ValidationError("Terminal SSH connection details are incomplete");
	}
	const port = Number.parseInt(data.terminal_port, 10);
	if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== String(data.terminal_port)) {
		throw new errs.ValidationError("Terminal SSH port must be an integer from 1 to 65535");
	}
	if (data.anubis_enabled || data.advanced_config?.trim() || data.locations?.length) {
		throw new errs.ValidationError("Terminal hosts cannot use Anubis, advanced configuration, or custom locations");
	}
	if (data.terminal_auth_type === "password" && !data.terminal_password) {
		throw new errs.ValidationError("Terminal password authentication requires a password");
	}
	if (data.terminal_auth_type === "key" && !data.terminal_private_key) {
		throw new errs.ValidationError("Terminal key authentication requires a private key");
	}
	if (!options.credentialsEncrypted) {
		if (data.terminal_password && Buffer.byteLength(data.terminal_password, "utf8") > 4096) {
			throw new errs.ValidationError("Terminal passwords cannot exceed 4096 bytes");
		}
		if (data.terminal_private_key && Buffer.byteLength(data.terminal_private_key, "utf8") > 65536) {
			throw new errs.ValidationError("Terminal private keys cannot exceed 64 KiB");
		}
	}

	const accessList = await AccessList.query()
		.findById(accessListId)
		.where("is_deleted", 0)
		.withGraphFetched("[items,clients]");
	if (!hasAuthenticatedAccessList(accessList)) {
		throw new errs.ValidationError(
			"Terminal access list must require a password, mTLS, Authentik, or OAuth2 login",
		);
	}
	if (!options.allowNewCertificate) {
		const certificate = await Certificate.query().findById(certificateId).where("is_deleted", 0);
		if (!certificate) throw new errs.ValidationError("Terminal certificate does not exist");
	}
};

const getTerminalHost = async (hostId) => {
	const host = await ProxyHost.query()
		.findById(hostId)
		.where("forward_scheme", "terminal")
		.where("is_deleted", 0)
		.withGraphFetched("[certificate,access_list.[items,clients],host_domains]");
	assertSecureHost(host);
	return host;
};

const gatewayPayload = ({ timestamp, hostId, authority, clientFingerprint, aclRevision }) =>
	`${timestamp}\n${hostId}\n${authority}\n${clientFingerprint}\n${aclRevision}`;

const verifyGatewayRequest = (headers, host, clientFingerprint) => {
	if (!CLIENT_FINGERPRINT_PATTERN.test(clientFingerprint || "")) {
		throw new errs.UnauthorizedError("Invalid terminal client fingerprint");
	}
	const timestamp = Number.parseInt(headers["x-shieldpm-terminal-timestamp"], 10);
	const signature = headers["x-shieldpm-terminal-signature"];
	const signedHostId = Number.parseInt(headers["x-shieldpm-terminal-host-id"], 10);
	const signedRevision = Number.parseInt(headers["x-shieldpm-terminal-acl-revision"], 10);
	const authority = normalizeAuthority(headers["x-shieldpm-terminal-authority"]);
	if (
		!Number.isInteger(timestamp) ||
		Math.abs(Math.floor(Date.now() / 1000) - timestamp) > GATEWAY_CLOCK_SKEW_SECONDS ||
		signedHostId !== host.id ||
		signedRevision !== getAccessRevision(host) ||
		typeof signature !== "string" ||
		!/^[A-Za-z0-9+/]{27}=$/.test(signature) ||
		!authorityMatchesHost(host, authority)
	) {
		throw new errs.UnauthorizedError("Invalid terminal gateway assertion");
	}

	let secret;
	try {
		secret = decrypt(host.terminal_gateway_secret);
	} catch (error) {
		throw new errs.InternalError("Terminal gateway secret could not be decrypted", error);
	}
	const expected = crypto
		.createHmac("sha1", secret)
		.update(
			gatewayPayload({
				timestamp,
				hostId: host.id,
				authority,
				clientFingerprint,
				aclRevision: signedRevision,
			}),
		)
		.digest("base64");
	if (!safeEqual(expected, signature)) {
		throw new errs.UnauthorizedError("Invalid terminal gateway signature");
	}
	return { authority, aclRevision: signedRevision };
};

const pruneTickets = () => {
	const now = Date.now();
	for (const [key, ticket] of tickets) {
		if (ticket.expiresAt <= now) tickets.delete(key);
	}
};

const hashTicket = (ticket) => crypto.createHash("sha256").update(ticket).digest("hex");

const parseProtocols = (header) => {
	if (typeof header !== "string") return null;
	const protocols = header.split(",").map((value) => value.trim());
	if (!protocols.includes(TERMINAL_PROTOCOL)) return null;
	const ticket = protocols.find((value) => value.startsWith("ticket."))?.slice(7);
	const clientFingerprint = protocols.find((value) => value.startsWith("fingerprint."))?.slice(12);
	if (!ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket) || !CLIENT_FINGERPRINT_PATTERN.test(clientFingerprint || "")) {
		return null;
	}
	return { ticket, clientFingerprint };
};

const consumeTicket = ({ token, hostId, authority, clientFingerprint, aclRevision }) => {
	pruneTickets();
	const ticketKey = hashTicket(token);
	const ticket = tickets.get(ticketKey);
	// Delete before checking any binding so a failed or raced exchange cannot reuse the credential.
	tickets.delete(ticketKey);
	if (
		!ticket ||
		ticket.expiresAt <= Date.now() ||
		ticket.hostId !== hostId ||
		ticket.authority !== authority ||
		ticket.clientFingerprint !== clientFingerprint ||
		ticket.aclRevision !== aclRevision
	) {
		throw new errs.UnauthorizedError("Terminal ticket is invalid or expired");
	}
	return ticket;
};

const expectedHostKeyDigest = (fingerprint) => {
	if (/^[A-Fa-f0-9]{64}$/.test(fingerprint)) return Buffer.from(fingerprint, "hex");
	return Buffer.from(fingerprint.slice("SHA256:".length), "base64");
};

const closeSocket = (socket, status, message) => {
	if (!socket.destroyed) {
		socket.write(
			`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
		);
		socket.destroy();
	}
};

const internalTerminal = {
	wss: null,
	server: null,
	upgradeHandler: null,
	validateHostConfiguration,

	init: (server) => {
		if (internalTerminal.wss) return;
		internalTerminal.server = server;
		internalTerminal.wss = new WebSocketServer({
			noServer: true,
			maxPayload: MAX_INPUT_BYTES,
			handleProtocols: (protocols) => (protocols.has(TERMINAL_PROTOCOL) ? TERMINAL_PROTOCOL : false),
		});

		internalTerminal.upgradeHandler = async (request, socket, head) => {
			try {
				const pathname = new URL(request.url, "http://localhost").pathname;
				const match = TERMINAL_PATH_PATTERN.exec(pathname);
				if (!match) return;
				const host = await getTerminalHost(Number.parseInt(match[1], 10));
				const protocolData = parseProtocols(request.headers["sec-websocket-protocol"]);
				if (!protocolData) throw new errs.UnauthorizedError("Terminal WebSocket protocol is invalid");
				const gateway = verifyGatewayRequest(request.headers, host, protocolData.clientFingerprint);
				const ticket = consumeTicket({
					token: protocolData.ticket,
					hostId: host.id,
					authority: gateway.authority,
					clientFingerprint: protocolData.clientFingerprint,
					aclRevision: gateway.aclRevision,
				});
				pendingConnections.set(request, { host, ticket });
				internalTerminal.wss.handleUpgrade(request, socket, head, (ws) => {
					internalTerminal.wss.emit("connection", ws, request);
				});
			} catch (error) {
				debug(logger, `Terminal upgrade rejected: ${error.message}`);
				closeSocket(socket, "401 Unauthorized", "Unauthorized");
			}
		};
		server.on("upgrade", internalTerminal.upgradeHandler);

		internalTerminal.wss.on("connection", internalTerminal.handleConnection);
		debug(logger, "Hardened WebSocket server for Terminal initialized");
	},

	/**
	 * Issue a one-use ticket from an authenticated Nginx gateway assertion.
	 * @param {number} hostId
	 * @param {Object} headers
	 * @param {string} clientFingerprint
	 * @returns {Promise<{ticket: string, expiresIn: number, protocol: string}>}
	 */
	issueTicket: async (hostId, headers, clientFingerprint) => {
		const gatewaySignature = headers["x-shieldpm-terminal-signature"];
		if (typeof gatewaySignature !== "string" || headers.authorization !== `Bearer ${gatewaySignature}`) {
			throw new errs.UnauthorizedError("Terminal tickets require explicit gateway bearer authentication");
		}
		const host = await getTerminalHost(hostId);
		const gateway = verifyGatewayRequest(headers, host, clientFingerprint);
		pruneTickets();
		if (tickets.size >= MAX_TICKETS) {
			throw new errs.ConfigurationError("Terminal ticket capacity reached; retry shortly");
		}
		const token = crypto.randomBytes(32).toString("base64url");
		tickets.set(hashTicket(token), {
			hostId: host.id,
			accessListId: host.access_list_id,
			authority: gateway.authority,
			clientFingerprint,
			aclRevision: gateway.aclRevision,
			expiresAt: Date.now() + TICKET_TTL_MS,
		});
		return { ticket: token, expiresIn: TICKET_TTL_MS / 1000, protocol: TERMINAL_PROTOCOL };
	},

	handleConnection: async (ws, request) => {
		const context = pendingConnections.get(request);
		pendingConnections.delete(request);
		if (!context) {
			ws.close(1008, "Missing terminal authorization");
			return;
		}
		const { host, ticket } = context;
		const sshClient = new Client();
		const session = {
			ws,
			sshClient,
			hostId: host.id,
			accessListId: host.access_list_id,
			aclRevision: ticket.aclRevision,
		};
		activeSessions.add(session);
		let initialCols = 80;
		let initialRows = 24;
		let sshStream = null;
		let closed = false;

		const close = (code = 1000, reason = "Terminal closed") => {
			if (closed) return;
			closed = true;
			activeSessions.delete(session);
			sshStream?.end();
			sshClient.end();
			if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(code, reason);
		};

		ws.on("message", (raw) => {
			if (raw.length > MAX_INPUT_BYTES) {
				close(1009, "Terminal input exceeds 64 KiB");
				return;
			}
			try {
				const message = JSON.parse(raw.toString("utf8"));
				if (message.type === "resize") {
					if (
						!Number.isInteger(message.cols) ||
						!Number.isInteger(message.rows) ||
						message.cols < 1 ||
						message.cols > MAX_COLS ||
						message.rows < 1 ||
						message.rows > MAX_ROWS
					) {
						close(1008, "Invalid terminal dimensions");
						return;
					}
					initialCols = message.cols;
					initialRows = message.rows;
					sshStream?.setWindow(message.rows, message.cols, 0, 0);
				} else if (message.type === "data" && sshStream) {
					if (typeof message.data !== "string" || Buffer.byteLength(message.data) > MAX_INPUT_BYTES) {
						close(1009, "Terminal input exceeds 64 KiB");
						return;
					}
					sshStream.write(message.data);
				} else if (message.type !== "data") {
					close(1008, "Unsupported terminal message");
				}
			} catch {
				close(1008, "Malformed terminal message");
			}
		});

		sshClient.on("ready", () => {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "status", status: "connected" }));
			sshClient.shell({ term: "xterm-256color", cols: initialCols, rows: initialRows }, (error, stream) => {
				if (error) {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ type: "error", message: "SSH shell could not be opened" }));
					}
					close(1011, "SSH shell error");
					return;
				}
				sshStream = stream;
				const decoder = new StringDecoder("utf8");
				stream.on("data", (data) => {
					if (ws.bufferedAmount > MAX_BUFFERED_OUTPUT_BYTES) {
						close(1013, "Terminal output backpressure limit reached");
						return;
					}
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ type: "data", data: decoder.write(data) }));
					}
				});
				stream.on("close", () => close(1000, "SSH session ended"));
			});
		});
		sshClient.on("error", () => {
			if (ws.readyState === WebSocket.OPEN)
				ws.send(JSON.stringify({ type: "error", message: "SSH connection failed" }));
			close(1011, "SSH connection failed");
		});
		sshClient.on("close", () => close());
		ws.on("close", () => close());
		ws.on("error", () => close(1011, "WebSocket error"));

		const expectedDigest = expectedHostKeyDigest(host.terminal_host_key_fingerprint);
		/** @type {import("ssh2").ConnectConfig} */
		const config = {
			host: host.terminal_host,
			port: host.terminal_port || 22,
			username: host.terminal_username,
			hostHash: "sha256",
			hostVerifier: (digest) => {
				try {
					return safeEqual(expectedDigest, Buffer.from(digest, "hex"));
				} catch {
					return false;
				}
			},
			readyTimeout: 15_000,
			keepaliveInterval: 15_000,
			keepaliveCountMax: 3,
		};
		try {
			if (host.terminal_auth_type === "password" && host.terminal_password) {
				config.password = decrypt(host.terminal_password);
			} else if (host.terminal_auth_type === "key" && host.terminal_private_key) {
				config.privateKey = decrypt(host.terminal_private_key);
			} else {
				close(1011, "Terminal credentials are unavailable");
				return;
			}
		} catch {
			close(1011, "Terminal credentials are unavailable");
			return;
		}

		try {
			sshClient.connect(config);
		} catch {
			close(1011, "SSH connection failed");
		}
	},

	revokeHost: async (hostId) => {
		for (const session of [...activeSessions]) {
			if (session.hostId === hostId) {
				session.sshClient.end();
				session.ws.close(1008, "Terminal host authorization changed");
			}
		}
		for (const [key, ticket] of tickets) {
			if (ticket.hostId === hostId) tickets.delete(key);
		}
	},

	revokeAccessList: async (accessListId) => {
		for (const session of [...activeSessions]) {
			if (session.accessListId === accessListId) {
				session.sshClient.end();
				session.ws.close(1008, "Terminal access authorization changed");
			}
		}
		for (const [key, ticket] of tickets) {
			if (ticket.accessListId === accessListId) tickets.delete(key);
		}
	},

	stopAll: async () => {
		tickets.clear();
		if (internalTerminal.server && internalTerminal.upgradeHandler) {
			internalTerminal.server.off("upgrade", internalTerminal.upgradeHandler);
		}
		for (const session of [...activeSessions]) {
			session.sshClient.end();
			session.ws.terminate();
		}
		activeSessions.clear();
		await new Promise((resolve) => {
			if (!internalTerminal.wss) return resolve(undefined);
			internalTerminal.wss.close(() => resolve(undefined));
		});
		internalTerminal.wss = null;
		internalTerminal.server = null;
		internalTerminal.upgradeHandler = null;
	},
};

export const __test = {
	assertSecureHost,
	authorityMatchesHost,
	consumeTicket,
	expectedHostKeyDigest,
	gatewayPayload,
	hasAuthenticatedAccessList,
	parseProtocols,
	verifyGatewayRequest,
};

export default internalTerminal;
