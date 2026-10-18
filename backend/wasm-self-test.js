#!/usr/bin/env node
// Installed usage: node /app/wasm-self-test.js. Does not open a database connection.
import { selfTest } from "./internal/wasm.js";

try {
	console.log(JSON.stringify(await selfTest()));
} catch {
	console.error("ShieldPM trusted Wasm execution verification failed");
	process.exitCode = 1;
}
