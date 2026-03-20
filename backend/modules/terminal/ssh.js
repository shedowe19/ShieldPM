import { StringDecoder } from "node:string_decoder";
import { Client } from "ssh2";
import { decrypt } from "../../lib/encryption.js";
import ProxyHost from "../../models/proxy_host.js";

const resolveHost = async (hostId) => {
	return ProxyHost.query().findById(hostId).where("forward_scheme", "terminal").where("is_deleted", 0).throwIfNotFound();
};

const buildSshConfig = (host) => {
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
	return config;
};

const attachShellBridge = ({ ws, sshClient, initialCols, initialRows, onStream }) => {
	sshClient.on("ready", () => {
		ws.send(JSON.stringify({ type: "status", status: "connected" }));
		sshClient.shell({ term: "xterm-256color", cols: initialCols.value, rows: initialRows.value }, (err, stream) => {
			if (err) {
				ws.send(JSON.stringify({ type: "error", message: `Shell error: ${err.message}` }));
				ws.close();
				return;
			}
			onStream(stream);
			const decoder = new StringDecoder("utf8");
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
};

const createSshClient = () => new Client();

export { attachShellBridge, buildSshConfig, createSshClient, resolveHost };
