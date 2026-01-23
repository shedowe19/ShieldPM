import cookie from "cookie";
import { Client } from "ssh2";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { getPublicKey } from "../lib/config.js";
import { decrypt } from "../lib/encryption.js";
import { debug, internal as logger } from "../logger.js";
import ProxyHost from "../models/proxy_host.js";

const internalTerminal = {
    wss: null,

    init: (server) => {
        internalTerminal.wss = new WebSocketServer({ noServer: true });

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
            const publicKey = getPublicKey();
            if (!publicKey) {
                throw new Error("Public key not available");
            }

            // Verify token signature and expiration (RS256)
            jwt.verify(token, publicKey, { algorithms: ["RS256"] });
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

        // Get Host Credentials from ProxyHost (forward_scheme: 'terminal')
        let host;
        try {
            host = await ProxyHost.query()
                .findById(hostId)
                .where("forward_scheme", "terminal")
                .where("is_deleted", 0)
                .throwIfNotFound();
        } catch (_err) {
            ws.close(1008, "Terminal host not found");
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
                            stream.setWindow(msg.cols, msg.rows, msg.height || 0, msg.width || 0);
                        }
                    } catch (_e) {
                        // Ignore parse errors
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

        // Decrypt password/key from ProxyHost terminal_* fields
        const config = {
            host: host.terminal_host,
            port: host.terminal_port || 22,
            username: host.terminal_username,
        };

        if (host.terminal_auth_type === "password" && host.terminal_password) {
            config.password = decrypt(host.terminal_password);
        } else if (host.terminal_auth_type === "key" && host.terminal_private_key) {
            config.privateKey = decrypt(host.terminal_private_key);
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
