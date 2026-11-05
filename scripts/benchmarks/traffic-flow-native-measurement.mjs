// Real Nginx → UDP → application parser measurement. No synthetic traffic is presented in the UI.
// TRAFFIC_SMOKE_NGINX_BIN=/path/to/module-enabled/nginx node scripts/benchmarks/traffic-flow-native-measurement.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import dgram from "node:dgram";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { LiveFlowBuffer } from "../../backend/lib/traffic-flow-live.js";

const binary = process.env.TRAFFIC_SMOKE_NGINX_BIN;
assert.ok(binary, "Set TRAFFIC_SMOKE_NGINX_BIN to a module-enabled Nginx binary");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "flow-app-native-"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const buffer = new LiveFlowBuffer();
const records = [];
const intervals = new Set();
const requests = new Set();
const sockets = new Set();
const receiver = dgram.createSocket("udp4");
receiver.on("message", (message) => {
	const record = JSON.parse(message.toString());
	records.push(record);
	buffer.ingest(record);
});
await new Promise((resolve) => receiver.bind(0, "127.0.0.1", resolve));
const payload = Buffer.alloc(65536, 120);
const origin = http.createServer((req, res) => {
	if (req.method === "POST") {
		let size = 0;
		req.on("data", (data) => { size += data.length; });
		req.on("end", () => res.end(String(size)));
		return;
	}
	let sent = 0;
	res.writeHead(200, { "Content-Length": payload.length * 16 });
	const timer = setInterval(() => {
		res.write(payload);
		if (++sent === 16) { clearInterval(timer); intervals.delete(timer); res.end(); }
	}, 500);
	intervals.add(timer);
	res.on("close", () => { clearInterval(timer); intervals.delete(timer); });
});
await new Promise((resolve) => origin.listen(0, "127.0.0.1", resolve));
const reserve = net.createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const config = path.join(directory, "nginx.conf");
await fs.writeFile(config, `daemon off; master_process off;
pid ${directory}/nginx.pid; error_log stderr warn;
events { worker_connections 64; }
http { access_log off; client_body_temp_path ${directory}/body; proxy_temp_path ${directory}/proxy;
 server { listen 127.0.0.1:${port}; shieldpm_traffic_flow 1 127.0.0.1:${receiver.address().port};
 location / { proxy_pass http://127.0.0.1:${origin.address().port}; proxy_buffering on; proxy_request_buffering off; limit_rate 64k; }
} }`);
let diagnostics = "";
const child = spawn(binary, ["-p", directory, "-c", config], { stdio: ["ignore", "ignore", "pipe"] });
child.stderr.on("data", (chunk) => { diagnostics += chunk; });
async function until(predicate, label) {
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error(diagnostics);
		const value = await predicate();
		if (value) return value;
		await delay(25);
	}
	throw new Error(`Timeout: ${label}\n${diagnostics}`);
}
const snapshot = () => {
	const hosts = [{ id: 1, clients: [], targets: [], truncated: false }];
	buffer.apply(hosts);
	return hosts[0];
};
function request(method) {
	let received = 0;
	let finished = false;
	let req;
	const done = new Promise((resolve, reject) => {
		req = http.request({ host: "127.0.0.1", port, method, agent: false,
			headers: method === "POST" ? { "Content-Length": 262144 } : {} }, (res) => {
			res.on("data", (data) => { received += data.length; });
			res.on("end", () => { finished = true; resolve(received); });
			res.on("error", reject);
		});
		req.on("error", reject);
		req.setTimeout(20000, () => req.destroy(new Error("transfer timeout")));
		requests.add(req);
	});
	done.catch(() => {});
	return { req, done, get received() { return received; }, get finished() { return finished; } };
}
try {
	await until(() => new Promise((resolve) => {
		const socket = net.connect(port, "127.0.0.1");
		sockets.add(socket);
		socket.once("connect", () => { socket.destroy(); sockets.delete(socket); resolve(true); });
		socket.once("error", () => { sockets.delete(socket); resolve(false); });
	}), "ready");
	const download = request("GET");
	download.req.end();
	const measured = await until(() => {
		const current = snapshot();
		return current.clients[0]?.rate?.download_bytes_per_second > 0 && current.targets[0]?.rate?.download_bytes_per_second > 0 ? current : null;
	}, "active client and upstream download rates");
	assert.equal(download.finished, false);
	assert.ok(download.received > 0 && download.received < 1048576);
	assert.equal(measured.clients[0].label, "127.0.0.0/24");
	const samples = records.filter((row) => row.request_id === records[0].request_id && !row.final);
	const last = samples.at(-1);
	const previous = samples.at(-2);
	const expected = (last.client_sent - previous.client_sent) * 1000 / (last.monotonic_ms - previous.monotonic_ms);
	assert.equal(measured.clients[0].rate.download_bytes_per_second, expected);
	assert.ok(measured.targets[0].label.startsWith("127.0.0.1:"));
	const downloadRate = measured.clients[0].rate.download_bytes_per_second;
	download.req.destroy();
	buffer.clear();
	await delay(100);
	const upload = request("POST");
	const uploadChunk = Buffer.alloc(32768, 121);
	let sent = 0;
	const timer = setInterval(() => {
		upload.req.write(uploadChunk);
		if (++sent === 8) { clearInterval(timer); intervals.delete(timer); upload.req.end(); }
	}, 600);
	intervals.add(timer);
	const uploaded = await until(() => {
		const current = snapshot();
		return current.clients[0]?.rate?.upload_bytes_per_second > 0 && current.targets[0]?.rate?.upload_bytes_per_second > 0 ? current : null;
	}, "active client and upstream upload rates");
	assert.equal(upload.finished, false);
	assert.ok(sent > 0 && sent < 8);
	assert.ok(uploaded.clients[0].active_requests > 0);
	console.log(JSON.stringify({ result: "PASS", download_active: true, download_bytes_received: download.received,
		download_rate: downloadRate, upload_active: true, upload_body_bytes_sent: sent * uploadChunk.length,
		upload_rate: uploaded.clients[0].rate.upload_bytes_per_second,
		upstream_upload_rate: uploaded.targets[0].rate.upload_bytes_per_second,
		exact_counter_interval_verified: true, masked_prefix: measured.clients[0].label }));
} finally {
	for (const timer of intervals) clearInterval(timer);
	for (const req of requests) req.destroy();
	for (const socket of sockets) socket.destroy();
	if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
	receiver.close();
	origin.closeAllConnections();
	await new Promise((resolve) => origin.close(resolve));
	await fs.rm(directory, { recursive: true, force: true });
}
