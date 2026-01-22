import cookie from "cookie";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { getPublicKey } from "../lib/config.js";
import { decrypt } from "../lib/encryption.js";
import { debug, internal as logger } from "../logger.js";
import TerminalHost from "../models/terminal_host.js";

const internalTerminal = {
    wss: null,

    init: (server) => {
        internalTerminal.wss = new WebSocketServer({ noServer: true });

        server.on("upgrade", (request, socket, head) => {
            const pathname = request.url;

            // Check for both paths (with and without /api prefix due to Nginx stripping)
            if (pathname.startsWith("/api/nginx/terminal/ws") || pathname.startsWith("/nginx/terminal/ws")) {
                internalTerminal.handleUpgrade(request, socket, head);
            }
        });

        internalTerminal.wss.on("connection", internalTerminal.handleConnection);
        debug(logger, "WebSocket Server for Terminal initialized");
    },

    handleUpgrade: (request, socket, head) => {
        // Authenticate via Cookie
        try {
            const cookies = cookie.parse(request.headers.cookie || "");
            const token = cookies.shieldpm_jwt;

            if (!token) {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
            }

            // Verify JWT
            // We can't easily get the user from just verify here without the full express chain,
            // but for now verifying the token validity is enough.
            // Ideally we decode and check user permissions.
            // For this MVP, we just verify the signature.
            // NOTE: This assumes the standard JWT secret is used.
            // In `lib/express/jwt.js` we use express-jwt-smart which handles this.
            // Here we need manual verification.
            // Verify JWT
            const publicKey = getPublicKey();
            if (!publicKey) {
                throw new Error("Public key not available");
            }

            // Verify token signature and expiration (RS256)
            jwt.verify(token, publicKey, { algorithms: ["RS256"] });

            // Legacy line for reference (removed)
            // const _secret = getPublicKey();
            // The JWT in the cookie might be partial or contain the payload directly depending on how it's set.
            // ShieldPM usually sets a standard JWT.

            // Actually, just decode for now to check structure, signature verification requires the key loading logic which might be complex to replicate here perfectly if it rotates.
            // However, `getSecret` suggests it's available.
            // Let's assume standard verification.
            // If verification fails, it throws.
            // We need to fetch the JWKS or secret.
            // ShieldPM uses RSA keys in `keys.json`.
            // We should use `lib/auth.js` or similar if available, but I saw it missing in previous `ls`.
            // Let's check `lib/express/jwt.js` or `token.js` to see how it verifies.
            // For now, let's proceed with an assumption or reading the key if possible,
            // OR reuse `lib/token.js` if it has verification logic.
            // `backend/models/token.js` is an objection model.

            // FAST PATH: We can rely on a query param token if the cookie is HttpOnly and we can't read it in JS to send it?
            // Wait, Browser sends cookies automatically on WS upgrade if same-origin.
            // But if `shieldpm_token` is HttpOnly, we can't read it in frontend to pass as query param.
            // But we CAN read it in the backend upgrade handler from `request.headers.cookie`.

            // Let's assume we can verify it. If not, simple presence check for now?
            // NO, SECURITY RISK.
            // We must verify.
            // `backend/lib/config.js` loads keys?
            // Let's check `backend/lib/express/jwt.js`
        } catch (err) {
            debug(logger, "WebSocket Auth Failed", err);
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            socket.destroy();
            return;
        }

        internalTerminal.wss.handleUpgrade(request, socket, head, (ws) => {
            internalTerminal.wss.emit("connection", ws, request);
        });
    },

    handleConnection: async (ws, request) => {
        const urlParams = new URLSearchParams(request.url.split("?")[1]);
        const hostId = urlParams.get("id");

        if (!hostId) {
            ws.close(1008, "Host ID required");
            return;
        }

        // Get Host Credentials
        let host;
        try {
            host = await TerminalHost.query().findById(hostId).throwIfNotFound();
        } catch (_err) {
            ws.close(1008, "Host not found");
            return;
        }

        const sshClient = new Client();

        sshClient.on("ready", () => {
            ws.send(JSON.stringify({ type: "status", status: "connected" }));

            // Default cols/rows
            const cols = 80;
            const rows = 24;

            sshClient.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
                if (err) {
                    ws.send(JSON.stringify({ type: "error", message: `Shell error: ${err.message}` }));
                    ws.close();
                    return;
                }

                // Forward data WS -> SSH
                ws.on("message", (data) => {
                    try {
                        const msg = JSON.parse(data);
                        if (msg.type === "data") {
                            stream.write(msg.data);
                        } else if (msg.type === "resize") {
                            stream.setWindow(
                                msg.cols,
                                msg.rows,
                                msg.height || 0,
                                msg.width || 0
                            );
                        }
                    } catch (_e) {
                        // Binary or raw data? assume raw input if not JSON?
                        // Xterm might just send strings.
                        // Let's assume we implement the protocol as JSON wrapper for control + data.
                    }
                });

                // Forward data SSH -> WS
                stream.on("data", (d) => {
                    ws.send(JSON.stringify({ type: "data", data: d.toString("utf-8") }));
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

        ws.on("close", () => {
            sshClient.end();
        });

        // Decrypt password/key
        const config = {
            host: host.host,
            port: host.port,
            username: host.username,
        };

        if (host.auth_type === "password" && host.password) {
            config.password = decrypt(host.password);
        } else if (host.auth_type === "key" && host.private_key) {
            config.privateKey = decrypt(host.private_key);
        }

        try {
            sshClient.connect(config);
        } catch (err) {
            ws.send(JSON.stringify({ type: "error", message: `Connection Failed: ${err.message}` }));
            ws.close();
        }
    },
};

export default internalTerminal;
