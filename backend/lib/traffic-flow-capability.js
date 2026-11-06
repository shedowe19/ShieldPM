import fs from "node:fs/promises";
import path from "node:path";
import utils from "./utils.js";

/** Isolated syntax check: never load active hosts or signal the running master. */
export async function detectNativeFlow() {
	let directory;
	try {
		const root = path.join(process.env.DATA_PATH || "/data", "shieldpm");
		await fs.mkdir(root, { recursive: true });
		directory = await fs.mkdtemp(path.join(root, "flow-capability-"));
		const config = path.join(directory, "nginx.conf");
		const quoted = (value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
		await fs.writeFile(
			config,
			`error_log stderr; pid ${quoted(path.join(directory, "nginx.pid"))}; events {} http { access_log off;
${["client_body", "proxy", "fastcgi", "uwsgi", "scgi"].map((kind) => `${kind}_temp_path ${quoted(path.join(directory, kind))};`).join("\n")}
server { listen 127.0.0.1:18949; shieldpm_traffic_flow 1 127.0.0.1:15149; } }`,
		);
		await utils.execFile("nginx", ["-tq", "-e", "stderr", "-p", `${directory}/`, "-c", config], { timeout: 5000 });
		return true;
	} catch {
		return false;
	} finally {
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	}
}
