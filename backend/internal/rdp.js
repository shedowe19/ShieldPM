import { WebSocketServer } from "ws";
import { decrypt } from "../lib/encryption.js";
import { debug, internal as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";

/**
 * RDP WebSocket Handler
 *
 * Bridges browser WebSocket clients to RDP servers using node-rdpjs-2.
 *
 * WebSocket URL patterns:
 *   /api/nginx/proxy-hosts/:id/rdp/ws[?width=W&height=H]
 *   /nginx/proxy-hosts/:id/rdp/ws[?width=W&height=H]  (after Nginx strips /api)
 *
 * Query params:
 *   width  - initial session width  (overrides host default)
 *   height - initial session height (overrides host default)
 *
 * Protocol (Client → Server):
 *   { type: "mouse", x, y, button, isDown }
 *   { type: "key", scancode, isDown }
 *   { type: "wheel", x, y, delta }
 *   { type: "resize", width, height }   ← reconnect with new resolution
 *
 * Protocol (Server → Client):
 *   { type: "status", status: "connecting" | "connected" | "disconnected" }
 *   { type: "error", message }
 *   { type: "size", width, height }
 *   { type: "bitmap", destLeft, destTop, destRight, destBottom, width, height, bitsPerPixel, data, isCompress }
 *   { type: "clipboard", data }
 */

let rdpModule = null;

/**
 * Lazy-load the node-rdpjs-2 module.
 * Returns null if the module is not installed.
 */
const getRdpModule = async () => {
	if (rdpModule !== null) return rdpModule;
	try {
		const mod = await import("node-rdpjs-2");
		rdpModule = mod.default || mod;
		return rdpModule;
	} catch (_err) {
		logger.warn("node-rdpjs-2 is not installed. RDP WebSocket support is unavailable.");
		logger.warn("Install it with: npm install node-rdpjs-2");
		return null;
	}
};

/**
 * Create and connect an RDP client, piping events to the given WebSocket.
 * Returns the rdpClient instance so the caller can close it later.
 */
// PROTOCOL_RDP = 0x00 (classic RDP security, no TLS)
// PROTOCOL_SSL = 0x01 (TLS – default in node-rdpjs-2 but rejected by many servers)
const PROTOCOL_RDP = 0x00000000;
const PROTOCOL_SSL = 0x00000001;

const buildRdpClient = (rdp, host, width, height, useSSL) => {
	const password = host.rdp_password ? decrypt(host.rdp_password) : "";
	const client = rdp.createClient({
		domain: host.rdp_domain || "",
		userName: host.rdp_username || "",
		password,
		enablePerf: true,
		autoLogin: true,
		screen: { width, height },
		logLevel: "ERROR",
		ignoreCertificate: host.rdp_ignore_cert !== 0,
	});
	// Override the negotiated protocol directly on the x224 layer.
	// node-rdpjs-2 always defaults to PROTOCOL_SSL which causes
	// X224_NEG_FAILURE code 2 (SSL_NOT_ALLOWED_BY_SERVER) on servers
	// that only support classic RDP security.
	client.x224.requestedProtocol = useSSL ? PROTOCOL_SSL : PROTOCOL_RDP;
	return client;
};

const attachHandlers = (rdpClient, host, ws) => {
	rdpClient.on("connect", () => {
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify({ type: "status", status: "connected" }));
		}
	});

	rdpClient.on("close", () => {
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify({ type: "status", status: "disconnected" }));
		}
	});

	rdpClient.on("bitmap", (bitmap) => {
		if (ws.readyState !== ws.OPEN) return;
		try {
			const data = Buffer.isBuffer(bitmap.data) ? bitmap.data.toString("base64") : bitmap.data;
			ws.send(
				JSON.stringify({
					type: "bitmap",
					destLeft: bitmap.destLeft,
					destTop: bitmap.destTop,
					destRight: bitmap.destRight,
					destBottom: bitmap.destBottom,
					width: bitmap.width,
					height: bitmap.height,
					bitsPerPixel: bitmap.bitsPerPixel,
					isCompress: bitmap.isCompress || false,
					data,
				}),
			);
		} catch (e) {
			logger.warn(`[RDP] Failed to send bitmap for host ${host.id}: ${e.message}`);
		}
	});

	rdpClient.on("clipboard", (data) => {
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify({ type: "clipboard", data: data?.toString() || "" }));
		}
	});
};

const createRdpSession = (rdp, host, ws, width, height) => {
	// Try TLS first; on SSL_NOT_ALLOWED_BY_SERVER (code 2) automatically
	// fall back to classic RDP security (PROTOCOL_RDP = 0x00).
	let rdpClient;
	let usedSSL = true;

	const tryConnect = (useSSL) => {
		try {
			rdpClient = buildRdpClient(rdp, host, width, height, useSSL);
		} catch (err) {
			ws.send(JSON.stringify({ type: "error", message: `Failed to create RDP client: ${err.message}` }));
			return null;
		}

		attachHandlers(rdpClient, host, ws);

		rdpClient.on("error", (err) => {
			const msg = err.message || String(err);
			// SSL_NOT_ALLOWED_BY_SERVER → retry without TLS
			if (useSSL && msg.includes("Failure code:2")) {
				logger.warn(`[RDP] Host ${host.id}: server rejected TLS (code 2), retrying with classic RDP security`);
				try { rdpClient.close(); } catch (_) {}
				tryConnect(false);
				return;
			}
			logger.error(`[RDP] Error for host ${host.id}: ${msg}`);
			if (ws.readyState === ws.OPEN) {
				ws.send(JSON.stringify({ type: "error", message: `RDP Error: ${msg}` }));
			}
		});

		try {
			rdpClient.connect(host.rdp_host, host.rdp_port || 3389);
		} catch (err) {
			ws.send(JSON.stringify({ type: "error", message: `Connection Failed: ${err.message}` }));
			return null;
		}

		usedSSL = useSSL;
		return rdpClient;
	};

	return tryConnect(true);
};

const internalRdp = {
	wss: null,

	init: (server) => {
		internalRdp.wss = new WebSocketServer({ noServer: true });

		server.on("upgrade", (request, socket, head) => {
			const pathname = request.url.split("?")[0];

			if (pathname.match(/^\/(?:api\/)?nginx\/proxy-hosts\/\d+\/rdp\/ws/)) {
				internalRdp.handleUpgrade(request, socket, head);
			}
		});

		internalRdp.wss.on("connection", internalRdp.handleConnection);
		debug(logger, "WebSocket Server for RDP initialized");
	},

	handleUpgrade: (request, socket, head) => {
		internalRdp.wss.handleUpgrade(request, socket, head, (ws) => {
			internalRdp.wss.emit("connection", ws, request);
		});
	},

	handleConnection: async (ws, request) => {
		// Parse host ID and optional client-requested dimensions from URL
		const [pathPart, queryPart] = request.url.split("?");
		const pathMatch = pathPart.match(/^\/(?:api\/)?nginx\/proxy-hosts\/(\d+)\/rdp\/ws/);
		if (!pathMatch) {
			ws.close(1008, "Host ID required");
			return;
		}
		const hostId = pathMatch[1];
		const queryParams = new URLSearchParams(queryPart || "");
		const clientWidth = Number.parseInt(queryParams.get("width") || "0", 10) || 0;
		const clientHeight = Number.parseInt(queryParams.get("height") || "0", 10) || 0;

		// Load the RDP module
		const rdp = await getRdpModule();
		if (!rdp) {
			ws.send(
				JSON.stringify({
					type: "error",
					message: "RDP support unavailable: node-rdpjs-2 is not installed on the server.",
				}),
			);
			ws.close();
			return;
		}

		// Get Host Credentials from ProxyHost (forward_scheme: 'rdp')
		let host;
		try {
			host = await ProxyHost.query()
				.findById(hostId)
				.where("forward_scheme", "rdp")
				.where("is_deleted", 0)
				.throwIfNotFound();
		} catch (_err) {
			ws.send(JSON.stringify({ type: "error", message: "RDP host not found" }));
			ws.close(1008, "RDP host not found");
			return;
		}

		// Determine session dimensions: client-provided > host config > defaults
		let sessionWidth = clientWidth || host.rdp_width || 1280;
		let sessionHeight = clientHeight || host.rdp_height || 800;

		// Notify client of actual session dimensions
		ws.send(JSON.stringify({ type: "size", width: sessionWidth, height: sessionHeight }));
		ws.send(JSON.stringify({ type: "status", status: "connecting" }));

		// Start the initial RDP session
		let rdpClient = createRdpSession(rdp, host, ws, sessionWidth, sessionHeight);

		// -------------------------------------------------------
		// Browser WebSocket → RDP input forwarding
		// -------------------------------------------------------
		ws.on("message", (rawData) => {
			try {
				const msg = JSON.parse(rawData.toString());
				switch (msg.type) {
					case "mouse":
						if (rdpClient) {
							rdpClient.sendPointerEvent(msg.x || 0, msg.y || 0, msg.button || 0, msg.isDown || false);
						}
						break;
					case "wheel":
						if (rdpClient) {
							rdpClient.sendPointerEvent(msg.x || 0, msg.y || 0, msg.delta > 0 ? 8 : 16, true);
						}
						break;
					case "key":
						if (rdpClient) {
							rdpClient.sendKeyEventScancode(msg.scancode || 0, msg.isDown || false);
						}
						break;
					case "clipboard":
						if (rdpClient && rdpClient.sendClipboardData && msg.data) {
							rdpClient.sendClipboardData(msg.data);
						}
						break;
					case "resize": {
						// Client requests reconnection with new resolution
						const newW = Math.max(640, Math.min(7680, msg.width || sessionWidth));
						const newH = Math.max(480, Math.min(4320, msg.height || sessionHeight));
						if (newW === sessionWidth && newH === sessionHeight) break;

						sessionWidth = newW;
						sessionHeight = newH;
						logger.info(`[RDP] Reconnecting host ${hostId} with new resolution ${newW}x${newH}`);

						// Close current session
						if (rdpClient) {
							try { rdpClient.close(); } catch (_e) { /* ignore */ }
							rdpClient = null;
						}

						// Notify client and reconnect
						ws.send(JSON.stringify({ type: "size", width: newW, height: newH }));
						ws.send(JSON.stringify({ type: "status", status: "connecting" }));
						rdpClient = createRdpSession(rdp, host, ws, newW, newH);
						break;
					}
					default:
						break;
				}
			} catch (_e) {
				// Ignore parse errors
			}
		});

		// -------------------------------------------------------
		// WebSocket close → disconnect RDP
		// -------------------------------------------------------
		ws.on("close", () => {
			if (rdpClient) {
				try { rdpClient.close(); } catch (_e) { /* ignore */ }
				rdpClient = null;
			}
		});
	},
};

export default internalRdp;
