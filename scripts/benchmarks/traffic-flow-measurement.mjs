// Isolated loopback evidence: access-log bytes become visible only at request completion.
// Run with TRAFFIC_SMOKE_NGINX_BIN=/path/to/nginx node scripts/benchmarks/traffic-flow-measurement.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import dgram from "node:dgram";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { FlowBuffer } from "../../backend/lib/traffic-flow.js";
import { Liquid } from "../../backend/node_modules/liquidjs/dist/liquid.node.mjs";

const binary = process.env.TRAFFIC_SMOKE_NGINX_BIN;
assert.ok(binary, "Set TRAFFIC_SMOKE_NGINX_BIN to an installed Nginx binary");
const directory = await fs.mkdtemp(
	path.join(os.tmpdir(), "traffic-flow-measurement-"),
);
const chunk = Buffer.alloc(64 * 1024, 120);
let release;
const gate = new Promise((resolve) => {
	release = resolve;
});
const origin = http.createServer(async (_req, res) => {
	res.writeHead(200, { "Content-Length": chunk.length * 2 });
	res.write(chunk);
	await gate;
	res.end(chunk);
});
await new Promise((resolve) => origin.listen(0, "127.0.0.1", resolve));
const reserve = net.createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const log = path.join(directory, "access.log");
const config = path.join(directory, "nginx.conf");
const datagrams = [];
const receiver = dgram.createSocket("udp4");
receiver.on("message", (message) => datagrams.push(message.toString()));
await new Promise((resolve) => receiver.bind(0, "127.0.0.1", resolve));
const format = await new Liquid().parseAndRender(
	await fs.readFile(
		new URL("../../backend/templates/_traffic_http.conf", import.meta.url),
		"utf8",
	),
	{ id: 1, traffic_flow_enabled: true },
);
await fs.writeFile(
	config,
	`daemon off;
master_process off;
pid ${directory}/nginx.pid;
error_log stderr warn;
events { worker_connections 32; }
http {
  lua_package_path "${process.env.TRAFFIC_SMOKE_LUA_DIRECTORY || "/usr/local/share/lua/5.1"}/?.lua;;";
  ${format}
  access_log ${log} spm_flow_1;
  access_log syslog:server=127.0.0.1:${receiver.address().port},tag=shieldpm_flow,nohostname spm_flow_1;
  server { listen 127.0.0.1:${port};
    location / { proxy_buffering off; proxy_pass http://127.0.0.1:${origin.address().port}; }
  }
}`,
);
let diagnostics = "";
const child = spawn(binary, ["-p", directory, "-c", config], {
	stdio: ["ignore", "ignore", "pipe"],
});
child.stderr.on("data", (data) => {
	diagnostics += data.toString();
});
const readLog = () => fs.readFile(log, "utf8").catch(() => "");
try {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (child.exitCode !== null) throw new Error(diagnostics);
		const ready = await new Promise((resolve) => {
			const socket = net.connect(port, "127.0.0.1");
			socket.once("connect", () => {
				socket.destroy();
				resolve(true);
			});
			socket.once("error", () => resolve(false));
		});
		if (ready) break;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	let received = 0;
	let firstChunk;
	const started = new Promise((resolve) => {
		firstChunk = resolve;
	});
	const finished = new Promise((resolve, reject) => {
		const req = http.get({ host: "127.0.0.1", port, agent: false }, (res) => {
			res.on("data", (data) => {
				received += data.length;
				firstChunk();
			});
			res.on("end", resolve);
			res.on("error", reject);
		});
		req.on("error", reject);
		req.setTimeout(10000, () => req.destroy(new Error("measurement timeout")));
	});
	await started;
	await new Promise((resolve) => setTimeout(resolve, 1200));
	assert.ok(received > 0 && received < chunk.length * 2);
	assert.equal(
		(await readLog()).trim(),
		"",
		"No request-end observation during active transfer",
	);
	assert.equal(
		datagrams.length,
		0,
		"No UDP completion observation during transfer",
	);
	release();
	await finished;
	let records = "";
	for (let attempt = 0; attempt < 100 && !records.trim(); attempt++) {
		records = await readLog();
		if (!records.trim())
			await new Promise((resolve) => setTimeout(resolve, 10));
	}
	const record = JSON.parse(records.trim());
	assert.equal(received, 131072);
	assert.equal(Number(record.bytes), received);
	for (let attempt = 0; attempt < 100 && !datagrams.length; attempt++)
		await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(datagrams.length, 1);
	const payload = datagrams[0].split("shieldpm_flow: ")[1];
	const buffer = new FlowBuffer();
	buffer.ingest(JSON.parse(payload));
	const [snapshot] = buffer.snapshot([
		{ id: 1, domain_names: ["example.test"], enabled: true },
	]);
	assert.equal(snapshot.clients[0].completed_bytes, received);
	assert.equal(snapshot.clients[0].label, "127.0.0.0/24");
	assert.equal(snapshot.clients[0].current_bytes_per_second, null);
	assert.ok(
		snapshot.targets.some(
			(target) =>
				target.kind === "observed" && target.label === record.upstream,
		),
	);
	assert.equal(record.upstream, `127.0.0.1:${origin.address().port}`);
	console.log(
		JSON.stringify({
			result: "PASS",
			received_bytes: received,
			observation_during_transfer: false,
			observation_after_completion: true,
			udp_collector_verified: true,
			current_rate_supported: false,
		}),
	);
} finally {
	release();
	if (child.exitCode === null) {
		child.kill("SIGTERM");
		await once(child, "exit");
	}
	receiver.close();
	origin.closeAllConnections();
	await new Promise((resolve) => origin.close(resolve));
	await fs.rm(directory, { recursive: true, force: true });
}
