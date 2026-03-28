import net from "net";
import { WebSocketServer } from "ws";
import { decrypt } from "../lib/encryption.js";
import { debug, internal as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";

/**
 * RDP WebSocket Handler — Apache Guacamole / guacd backend
 *
 * Architecture:
 *   Browser (guacamole-common-js, Guacamole protocol over WebSocket)
 *     ↕  ws://…/nginx/proxy-hosts/:id/rdp/ws
 *   ShieldPM backend  ← this file
 *     ↕  TCP 127.0.0.1:4822 (Guacamole protocol)
 *   guacd  (Apache Guacamole proxy daemon, uses FreeRDP internally)
 *     ↕  RDP + NLA/CredSSP  (full Windows authentication)
 *   Windows RDP Server
 *
 * Guacamole handshake (backend ↔ guacd):
 *   1. backend → guacd : select rdp
 *   2. guacd   → backend: args <param-list>
 *   3. backend → guacd : size / audio / video / image
 *   4. backend → guacd : connect <param-values in args order>
 *   5. guacd   → backend: ready <connection-id>
 *   → pipe everything else transparently both ways
 *
 * WebSocket URL:
 *   /api/nginx/proxy-hosts/:id/rdp/ws[?width=W&height=H]
 *   /nginx/proxy-hosts/:id/rdp/ws[?width=W&height=H]    (after nginx strips /api)
 */

const GUACD_HOST = "127.0.0.1";
const GUACD_PORT = 4822;

// ── Guacamole protocol helpers ──────────────────────────────────────────────

/**
 * Build one complete Guacamole instruction.
 * Format: "len.val,len.val,...;"
 */
function guacInstruction(...args) {
	return (
		args
			.map((a) => {
				const s = String(a ?? "");
				return `${s.length}.${s}`;
			})
			.join(",") + ";"
	);
}

/**
 * Parse all complete Guacamole instructions out of `buffer`.
 * Returns { instructions: [{opcode, args}], remaining: string }
 *
 * Each element: LENGTH "." VALUE
 * Elements separated by "," instruction terminated by ";"
 */
function parseInstructions(buffer) {
	const instructions = [];
	let i = 0;

	outer: while (i < buffer.length) {
		const elems = [];
		let pos = i;

		while (pos < buffer.length) {
			// Read element length
			const dot = buffer.indexOf(".", pos);
			if (dot === -1) break outer; // incomplete, need more data

			const len = parseInt(buffer.substring(pos, dot), 10);
			if (isNaN(len) || len < 0) {
				// Malformed — skip to next instruction boundary
				const semi = buffer.indexOf(";", pos);
				if (semi === -1) break outer;
				i = semi + 1;
				continue outer;
			}

			const valStart = dot + 1;
			const valEnd = valStart + len;
			if (valEnd > buffer.length) break outer; // incomplete

			elems.push(buffer.substring(valStart, valEnd));
			pos = valEnd;

			const sep = buffer[pos];
			if (sep === ",") {
				pos++;
				continue;
			}
			if (sep === ";") {
				pos++;
				if (elems.length > 0) {
					instructions.push({ opcode: elems[0], args: elems.slice(1) });
				}
				i = pos;
				break;
			}
			// Malformed separator — skip to next ";"
			const semi = buffer.indexOf(";", pos);
			if (semi === -1) break outer;
			i = semi + 1;
			continue outer;
		}

		if (pos === i) break; // no progress — truly incomplete
	}

	return { instructions, remaining: buffer.substring(i) };
}

// ── guacd session ───────────────────────────────────────────────────────────

/**
 * Connect to guacd, perform the RDP handshake, then pipe WebSocket ↔ TCP.
 * The browser uses guacamole-common-js which speaks the Guacamole protocol
 * natively — after the handshake the backend is a transparent bridge.
 */
function createGuacdSession(host, ws, width, height) {
	const rdpHost = host.rdp_host;
	const rdpPort = String(host.rdp_port || 3389);
	const username = host.rdp_username || "";
	const password = host.rdp_password ? decrypt(host.rdp_password) : "";
	const domain = host.rdp_domain || "";
	const ignoreCert = host.rdp_ignore_cert ? "true" : "";
	const sessionW = String(width);
	const sessionH = String(height);

	logger.info(
		`[RDP] Connecting host ${host.id} → guacd → ${rdpHost}:${rdpPort}` +
			` (user: ${username || "(none)"})`,
	);

	let tcpBuf = "";
	let handshakeDone = false;
	let expectedArgs = [];
	let closed = false;

	// ── helpers ──
	function safeClose(errMsg) {
		if (closed) return;
		closed = true;
		if (errMsg) {
			logger.error(`[RDP] Error for host ${host.id}: ${errMsg}`);
			try {
				ws.send(guacInstruction("error", errMsg, "512"));
			} catch (_) {}
		}
		try {
			ws.send(guacInstruction("disconnect"));
		} catch (_) {}
		try {
			guacdSocket.destroy();
		} catch (_) {}
	}

	// ── TCP socket to guacd ──
	const guacdSocket = net.createConnection(GUACD_PORT, GUACD_HOST);

	guacdSocket.on("error", (err) => {
		safeClose(
			`guacd unreachable (127.0.0.1:${GUACD_PORT}): ${err.message}. ` +
				"Is guacd installed and running?",
		);
	});

	guacdSocket.on("close", () => {
		if (!closed) safeClose(null);
	});

	// Phase 1 — select protocol
	guacdSocket.on("connect", () => {
		guacdSocket.write(guacInstruction("select", "rdp"));
	});

	guacdSocket.on("data", (chunk) => {
		tcpBuf += chunk.toString("utf8");
		const { instructions, remaining } = parseInstructions(tcpBuf);
		tcpBuf = remaining;

		for (const { opcode, args } of instructions) {
			if (!handshakeDone) {
				handleHandshake(opcode, args);
			} else {
				// Pipe drawing instruction to browser
				if (ws.readyState === 1) {
					try {
						ws.send(guacInstruction(opcode, ...args));
					} catch (_) {}
				}
			}
		}
	});

	// ── Guacamole handshake state machine ──
	function handleHandshake(opcode, args) {
		if (opcode === "args") {
			// Phase 2 — guacd tells us which RDP parameters it expects (in order)
			expectedArgs = args;

			// Phase 3 — send client capabilities
			guacdSocket.write(guacInstruction("size", sessionW, sessionH, "96"));
			guacdSocket.write(guacInstruction("audio"));
			guacdSocket.write(guacInstruction("video"));
			guacdSocket.write(
				guacInstruction("image", "image/png", "image/jpeg", "image/webp"),
			);

			// Phase 4 — connect: values must be in the exact order guacd asked for.
			// `security=any` → FreeRDP auto-negotiates NLA → TLS → RDP.
			// Users no longer need to disable NLA in Windows registry.
			const paramMap = {
				hostname: rdpHost,
				port: rdpPort,
				username: username,
				password: password,
				domain: domain,
				width: sessionW,
				height: sessionH,
				dpi: "96",
				"color-depth": "24",
				security: "any",
				"ignore-cert": ignoreCert,
				"resize-method": "display-update",
				"enable-font-smoothing": "true",
				"enable-wallpaper": "true",
				"enable-theming": "true",
				"enable-desktop-composition": "true",
				"enable-menu-animations": "true",
			};

			const connectArgs = expectedArgs.map((arg) => paramMap[arg] ?? "");
			guacdSocket.write(guacInstruction("connect", ...connectArgs));
		} else if (opcode === "ready") {
			// Phase 5 — guacd connected to Windows, handshake complete
			handshakeDone = true;
			const connId = args[0] || "";
			logger.info(
				`[RDP] guacd ready for host ${host.id}, connection: ${connId}`,
			);

			// Forward `ready` to browser — guacamole-common-js starts rendering
			if (ws.readyState === 1) {
				try {
					ws.send(guacInstruction("ready", connId));
				} catch (_) {}
			}
		} else if (opcode === "error") {
			const msg = args[0] || "Unknown error";
			const code = args[1] || "0";
			safeClose(`${msg} (code ${code})`);
		}
		// `nop` and other pre-ready instructions are silently ignored
	}

	// ── WebSocket → guacd (input events from browser) ──
	ws.on("message", (rawData) => {
		if (closed) return;
		try {
			guacdSocket.write(rawData.toString());
		} catch (_) {}
	});

	ws.on("close", () => safeClose(null));
	ws.on("error", () => safeClose(null));

	return guacdSocket;
}

// ── WebSocket server ────────────────────────────────────────────────────────

const internalRdp = {
	wss: null,

	init: (server) => {
		internalRdp.wss = new WebSocketServer({
			noServer: true,
			// Accept the `guacamole` subprotocol that guacamole-common-js requests.
			// Chrome/Firefox reject the WS handshake if the server doesn't acknowledge
			// the requested subprotocol.
			handleProtocols: (protocols) => {
				if (protocols.has("guacamole")) return "guacamole";
				// Accept raw connections (e.g. direct testing) without subprotocol
				return protocols.size === 0 ? "" : false;
			},
		});

		server.on("upgrade", (request, socket, head) => {
			const pathname = request.url.split("?")[0];
			if (pathname.match(/^\/(?:api\/)?nginx\/proxy-hosts\/\d+\/rdp\/ws/)) {
				internalRdp.handleUpgrade(request, socket, head);
			}
		});

		internalRdp.wss.on("connection", internalRdp.handleConnection);
		debug(logger, "WebSocket Server for RDP (guacd bridge) initialized");
	},

	handleUpgrade: (request, socket, head) => {
		internalRdp.wss.handleUpgrade(request, socket, head, (ws) => {
			internalRdp.wss.emit("connection", ws, request);
		});
	},

	handleConnection: async (ws, request) => {
		const [pathPart, queryPart] = request.url.split("?");
		const pathMatch = pathPart.match(
			/^\/(?:api\/)?nginx\/proxy-hosts\/(\d+)\/rdp\/ws/,
		);
		if (!pathMatch) {
			ws.close(1008, "Host ID required");
			return;
		}

		const hostId = pathMatch[1];
		const queryParams = new URLSearchParams(queryPart || "");
		const clientWidth =
			Number.parseInt(queryParams.get("width") || "0", 10) || 1280;
		const clientHeight =
			Number.parseInt(queryParams.get("height") || "0", 10) || 800;

		// Load host config from DB
		let host;
		try {
			host = await ProxyHost.query()
				.findById(hostId)
				.where("forward_scheme", "rdp")
				.where("is_deleted", 0)
				.throwIfNotFound();
		} catch (_err) {
			try {
				ws.send(guacInstruction("error", "RDP host not found", "512"));
				ws.send(guacInstruction("disconnect"));
			} catch (_) {}
			ws.close(1008, "RDP host not found");
			return;
		}

		const sessionWidth = clientWidth || host.rdp_width || 1280;
		const sessionHeight = clientHeight || host.rdp_height || 800;

		createGuacdSession(host, ws, sessionWidth, sessionHeight);
	},
};

export default internalRdp;
