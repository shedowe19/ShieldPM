import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

let child;
let directory;
afterEach(() => {
	child?.kill("SIGKILL");
	if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

it("fences every second process on the same volume and recovers after a hard process death", async () => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-db-process-fence-"));
	const bootstrap = new URL("../../bootstrap-app.js", import.meta.url).href;
	const claim = `const {claimStartupLock}=await import(${JSON.stringify(bootstrap)});claimStartupLock();`;
	const env = { ...process.env, DATA_PATH: directory };
	child = spawn(
		process.execPath,
		["--input-type=module", "-e", `${claim}console.log('LOCKED');setInterval(()=>{},1000);`],
		{ env, stdio: ["ignore", "pipe", "pipe"] },
	);
	await Promise.race([
		once(child.stdout, "data"),
		once(child, "exit").then(() => {
			throw new Error("Lock owner exited prematurely");
		}),
	]);
	const blocked = spawnSync(process.execPath, ["--input-type=module", "-e", claim], {
		env,
		encoding: "utf8",
		timeout: 3000,
	});
	expect(blocked.status).toBe(1);
	expect(blocked.stderr).toContain("Another ShieldPM process holds");
	expect(fs.existsSync(path.join(directory, "shieldpm/database.sqlite"))).toBe(false);
	expect(fs.existsSync(path.join(directory, "shieldpm/keys.json"))).toBe(false);
	const stopped = once(child, "exit");
	child.kill("SIGKILL");
	await stopped;
	child = null;
	const recovered = spawnSync(process.execPath, ["--input-type=module", "-e", claim], {
		env,
		encoding: "utf8",
		timeout: 3000,
	});
	expect(recovered.status, recovered.stderr).toBe(0);
});

it("runs the real full target migration chain without importing models or creating instance keys", () => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "shieldpm-db-cold-schema-"));
	const service = new URL("../../lib/database-switch.js", import.meta.url).href;
	const program = `
		import fs from 'node:fs';
		const service = await import(${JSON.stringify(service)});
		service.requestDatabaseOperation({engine:'sqlite'},true);
		await service.executeDatabaseOperation();
		if(fs.existsSync(process.env.DATA_PATH+'/shieldpm/keys.json')) throw new Error('Application imported before activation');
		if(service.readOperation().phase!=='activated') throw new Error('Target was not activated');
		console.log('COLD_SCHEMA_VERIFIED');
	`;
	const result = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
		env: {
			...process.env,
			DATA_PATH: directory,
			DB_MYSQL_HOST: "",
			DB_MYSQL_PORT: "",
			DB_MYSQL_USER: "",
			DB_MYSQL_NAME: "",
			DB_MYSQL_PASSWORD: "",
			DB_POSTGRES_HOST: "",
			DB_POSTGRES_PORT: "",
			DB_POSTGRES_USER: "",
			DB_POSTGRES_NAME: "",
			DB_POSTGRES_PASSWORD: "",
		},
		encoding: "utf8",
		timeout: 15_000,
	});
	expect(result.status, result.stderr).toBe(0);
	expect(result.stdout).toContain("COLD_SCHEMA_VERIFIED");
});
