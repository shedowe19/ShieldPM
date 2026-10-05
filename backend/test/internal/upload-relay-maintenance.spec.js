import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const relayModule = new URL("../../internal/upload-relay.js", import.meta.url).href;
const loggerModule = new URL("../../logger.js", import.meta.url).href;
const childSetup = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';
import { createUploadRelay } from ${JSON.stringify(relayModule)};
import { global as logger } from ${JSON.stringify(loggerModule)};
const root = await mkdtemp(join(tmpdir(), 'shieldpm-relay-maintenance-'));
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
const waitUntil = async condition => {
 const deadline = Date.now() + 1500;
 while (!condition()) {
  assert.ok(Date.now() < deadline, 'maintenance did not finish');
  await wait(10);
 }
};
const relay = createUploadRelay({ root, getHost: async () => ({
 id: 7, enabled: true, is_deleted: false, upload_relay_enabled: true,
 access_list_id: 0, forward_scheme: 'http', forward_host: '127.0.0.1', forward_port: 80,
}) });
const upload = await relay.create(7, { length: 6 });
`;
const run = (script) =>
	spawnSync(process.execPath, ["--input-type=module", "-e", `${childSetup}\n${script}`], {
		encoding: "utf8",
		timeout: 5000,
	});
const passed = (result) => {
	expect(result.error).toBeUndefined();
	expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
	expect(result.stdout).toContain("maintenance regression passed");
};

describe("upload relay background maintenance in a real Node process", () => {
	it("survives a regular session DELETE after directory enumeration without logging a storage failure", () => {
		passed(
			run(`
const readdir = fs.promises.readdir;
let removed = false;
let rootScans = 0;
let maintenanceErrors = 0;
logger.error = () => { maintenanceErrors++; };
fs.promises.readdir = async function(directory, ...args) {
 const entries = await readdir.call(this, directory, ...args);
 if (directory === root) rootScans++;
 if (directory === join(root, 'host-7') && !removed) {
  removed = true;
  await relay.remove(7, upload.id);
 }
 return entries;
};
relay.init();
await waitUntil(() => rootScans >= 2);
await relay.stop();
assert.equal(removed, true);
assert.equal(maintenanceErrors, 0);
assert.deepEqual(await readdir(join(root, 'host-7')), []);
console.log('maintenance regression passed');
`),
		);
	});

	it("propagates genuine storage errors from an explicit cleanup call", () => {
		passed(
			run(`
const readdir = fs.promises.readdir;
const denied = Object.assign(new Error('synthetic storage denied'), { code: 'EACCES' });
fs.promises.readdir = async function(directory, ...args) {
 if (directory === root) throw denied;
 return readdir.call(this, directory, ...args);
};
await assert.rejects(relay.cleanupExpired(), error => error === denied);
console.log('maintenance regression passed');
`),
		);
	});

	it("logs initial and hourly storage failures without an unhandled rejection", () => {
		passed(
			run(`
const readdir = fs.promises.readdir;
const denied = Object.assign(new Error('synthetic storage denied'), { code: 'EACCES' });
const logged = [];
logger.error = (...args) => logged.push(args);
fs.promises.readdir = async function(directory, ...args) {
 if (directory === root) throw denied;
 return readdir.call(this, directory, ...args);
};
let hourly;
globalThis.setInterval = (callback, duration) => {
 assert.equal(duration, 60 * 60 * 1000);
 hourly = callback;
 return { unref() {} };
};
relay.init();
await waitUntil(() => logged.length === 1);
assert.equal(logged.length, 1);
hourly();
await waitUntil(() => logged.length === 2);
assert.equal(logged.length, 2);
for (const [message, error] of logged) {
 assert.equal(message, 'Upload relay maintenance failed:');
 assert.equal(error, denied);
}
await relay.stop();
console.log('maintenance regression passed');
`),
		);
	});
});
