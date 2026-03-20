import { WebSocketServer } from "ws";
import { debug, internal as logger } from "../../logger.js";
import { attachShellBridge, buildSshConfig, createSshClient, resolveHost } from "./ssh.js";

const terminalService = {
	wss: null,

	init(server) {
		terminalService.wss = new WebSocketServer({ noServer: true });
		server.on("upgrade", (request, socket, head) => {
			const pathname = request.url;
			if (
				pathname.match(/^\/(?:api\/)?nginx\/proxy-hosts\/\d+\/terminal\/ws/) ||
				pathname.match(/^\/(?:api\/)?nginx\/terminal\/ws/)
			) {
				terminalService.handleUpgrade(request, socket, head);
			}
		});
		terminalService.wss.on("connection", terminalService.handleConnection);
		debug(logger, "WebSocket Server for Terminal initialized");
	},

	handleUpgrade(request, socket, head) {
		terminalService.wss.handleUpgrade(request, socket, head, (ws) => {
			terminalService.wss.emit("connection", ws, request);
		});
	},

	async handleConnection(ws, request) {
		let hostId = null;
		const pathMatch = request.url.match(/\/proxy-hosts\/(\d+)\/terminal\/ws/);
		if (pathMatch) hostId = pathMatch[1];
		else {
			const urlParams = new URLSearchParams(request.url.split("?")[1]);
			hostId = urlParams.get("id");
		}
		if (!hostId) {
			ws.close(1008, "Host ID required");
			return;
		}
		let host;
		try {
			host = await resolveHost(hostId);
		} catch {
			ws.close(1008, "Terminal host not found");
			return;
		}
		const sshClient = createSshClient();
		const initialCols = { value: 80 };
		const initialRows = { value: 24 };
		let sshStream = null;
		ws.on("message", (data) => {
			try {
				const msg = JSON.parse(data);
				if (msg.type === "resize") {
					initialCols.value = msg.cols;
					initialRows.value = msg.rows;
					if (sshStream) sshStream.setWindow(msg.cols, msg.rows);
				} else if (msg.type === "data" && sshStream) {
					sshStream.write(msg.data);
				}
			} catch {}
		});
		attachShellBridge({ ws, sshClient, initialCols, initialRows, onStream: (stream) => { sshStream = stream; } });
		ws.on("close", () => {
			sshClient.end();
		});
		try {
			sshClient.connect(buildSshConfig(host));
		} catch (err) {
			ws.send(JSON.stringify({ type: "error", message: `Connection Failed: ${err.message}` }));
			ws.close();
		}
	},
};

export default terminalService;
