#!/usr/bin/env node
// Execute backed-up policies in an isolated child/data directory, never the active instance.
import fs from "node:fs/promises";
import { stopWasiHostBridges } from "./internal/wasi-host-bridge.js";
import { prepareHost } from "./internal/wasm.js";

try {
	const hosts = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
	if (!Array.isArray(hosts) || hosts.length > 30_000) throw new Error("Invalid host preflight input");
	for (const host of hosts) await prepareHost(host);
} catch {
	console.error("Restored Wasm policies did not pass their execution preflight");
	process.exitCode = 1;
} finally {
	await stopWasiHostBridges();
}
