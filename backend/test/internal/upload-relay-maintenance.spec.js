import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const relayModule = new URL("../../internal/upload-relay.js", import.meta.url).href;
const loggerModule = new URL("../../logger.js", import.meta.url).href;
const childSetup = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createUploadRelay, relayConfigForHost } from ${JSON.stringify(relayModule)};
import { global as logger } from ${JSON.stringify(loggerModule)};
const root = await mkdtemp(join(tmpdir(), 'shieldpm-relay-maintenance-'));
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
const host = {
 id: 7, enabled: true, is_deleted: false, upload_relay_enabled: true,
 access_list_id: 0, forward_scheme: 'http', forward_host: '127.0.0.1', forward_port: 80,
};
const relay = createUploadRelay({ root, getHost: async () => host });
`;
const run = (script) =>
	spawnSync(
		process.execPath,
		["--unhandled-rejections=strict", "--input-type=module", "-e", `${childSetup}\n${script}`],
		{
			encoding: "utf8",
			timeout: 5000,
		},
	);
const passed = (result) => {
	expect(result.error).toBeUndefined();
	expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
	expect(result.stdout).toContain("maintenance regression passed");
};

describe("upload relay background maintenance in a real Node process", () => {
	it("survives a regular session DELETE after directory enumeration without logging a storage failure", () => {
		passed(
			run(`
// Maintenance starts with an already persisted session; creation durability is tested separately.
const upload = {
 id: '11111111-1111-4111-8111-111111111111', hostId: 7,
 length: 6, offset: 0, chunks: [], state: 'uploading',
 createdAt: new Date().toISOString(), config: relayConfigForHost(host),
};
const uploadDirectory = join(root, 'host-7', upload.id);
fs.mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });
fs.writeFileSync(join(uploadDirectory, 'upload.json'), JSON.stringify(upload), { mode: 0o600 });
assert.equal((await relay.get(7, upload.id)).offset, 0);
const recovered = Promise.withResolvers();
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
 } else if (directory === join(root, 'host-7') && rootScans === 2) {
  assert.deepEqual(entries, []);
  recovered.resolve();
 }
 return entries;
};
relay.init();
await recovered.promise;
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
const initialFailure = Promise.withResolvers();
const hourlyFailure = Promise.withResolvers();
logger.error = (...args) => {
 logged.push(args);
 if (logged.length === 1) initialFailure.resolve();
 else hourlyFailure.resolve();
};
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
await initialFailure.promise;
assert.equal(logged.length, 1);
hourly();
await hourlyFailure.promise;
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
