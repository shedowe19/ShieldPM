import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupCommand, InstanceBackup } from "../../lib/instance-backup.js";

describe("complete encrypted instance backup", () => {
	let directory;
	let engine;
	let validate;
	const password = "a long synthetic backup password";
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-backup-"));
		await fs.mkdir(path.join(directory, "shieldpm"));
		await fs.mkdir(path.join(directory, "tls/certbot/archive/npm-1"), { recursive: true });
		await fs.mkdir(path.join(directory, "tls/certbot/live/npm-1"), { recursive: true });
		await fs.writeFile(path.join(directory, ".env"), "GEOIP_AUTO_UPDATE=false\n");
		await fs.writeFile(
			path.join(directory, "shieldpm/keys.json"),
			JSON.stringify({ encryptionKey: "synthetic-secret-key" }),
		);
		await fs.writeFile(path.join(directory, "tls/certbot/archive/npm-1/fullchain1.pem"), "synthetic-certificate");
		await fs.symlink(
			"../../archive/npm-1/fullchain1.pem",
			path.join(directory, "tls/certbot/live/npm-1/fullchain.pem"),
		);
		const database = new Database(path.join(directory, "shieldpm/database.sqlite"));
		database.pragma("journal_mode = WAL");
		database.exec(
			"CREATE TABLE user (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE migrations (name TEXT); INSERT INTO user VALUES(1,'Original'); INSERT INTO migrations VALUES('test-migration.js');",
		);
		database.close();
		validate = vi.fn().mockResolvedValue(undefined);
		engine = new InstanceBackup({
			directory,
			version: "test-version",
			config: {
				engine: "knex-native",
				knex: { connection: { filename: path.join(directory, "shieldpm/database.sqlite") } },
			},
			validateNginx: validate,
			migrationNames: ["test-migration.js"],
		});
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.rm(directory, { recursive: true, force: true });
	});
	it("roundtrips committed WAL state, certificates, keys, env and links without exposing secrets in the catalog", async () => {
		const database = new Database(path.join(directory, "shieldpm/database.sqlite"));
		database.pragma("journal_mode=WAL");
		database.pragma("wal_autocheckpoint=0");
		database.exec("INSERT INTO user VALUES(2,'Committed in WAL')");
		const row = await engine.create(password, "before upgrade");
		database.close();
		const ciphertext = await fs.readFile(engine.archive(row.id));
		expect(ciphertext.includes(Buffer.from("synthetic-secret-key"))).toBe(false);
		expect(ciphertext.includes(Buffer.from("Committed in WAL"))).toBe(false);
		expect(JSON.stringify(await engine.list())).not.toContain("synthetic-secret-key");
		const result = await engine.verify(row.id, password);
		expect(result.valid).toBe(true);
		expect(validate).toHaveBeenCalledOnce();
		const live = new Database(path.join(directory, "shieldpm/database.sqlite"));
		live.exec("UPDATE user SET name='Newer' WHERE id=1");
		live.close();
		await engine.verify(row.id, password, { schedule: true });
		expect((await engine.pending()).phase).toBe("pending");
		const beforeActivation = new Database(path.join(directory, "shieldpm/database.sqlite"));
		expect(beforeActivation.prepare("SELECT name FROM user WHERE id=1").get().name).toBe("Newer");
		beforeActivation.close();
		expect(await engine.apply()).toBe(true);
		const restored = new Database(path.join(directory, "shieldpm/database.sqlite"));
		expect(restored.prepare("SELECT name FROM user ORDER BY id").all()).toEqual([
			{ name: "Original" },
			{ name: "Committed in WAL" },
		]);
		restored.close();
		expect(await fs.readFile(path.join(directory, "shieldpm/keys.json"), "utf8")).toContain("synthetic-secret-key");
		expect(await fs.readlink(path.join(directory, "tls/certbot/live/npm-1/fullchain.pem"))).toBe(
			"../../archive/npm-1/fullchain1.pem",
		);
		expect(await engine.commit()).toBe(true);
		expect(await engine.pending()).toBeNull();
	});
	it("requires Wasm preflight only for enabled, non-deleted hosts with enabled filters", async () => {
		const database = new Database(path.join(directory, "shieldpm/database.sqlite"));
		database.exec(
			"CREATE TABLE proxy_host (id INTEGER PRIMARY KEY, enabled INTEGER, is_deleted INTEGER, meta TEXT)",
		);
		const insert = database.prepare("INSERT INTO proxy_host VALUES (?, ?, ?, ?)");
		const enabled = JSON.stringify({ wasm_filters: [{ enabled: true, type: "request_headers" }] });
		insert.run(1, 1, 0, enabled);
		insert.run(2, 0, 0, enabled);
		insert.run(3, 1, 1, enabled);
		insert.run(4, 1, 0, JSON.stringify({ wasm_filters: [{ enabled: false }] }));
		database.close();
		vi.spyOn(engine, "wasmCheck").mockResolvedValue(undefined);
		const row = await engine.create(password);
		await engine.verify(row.id, password);
		expect(engine.wasmHosts.map(({ id }) => id)).toEqual([1]);
	});

	it("rejects wrong passwords, truncated and modified archives without changing the instance", async () => {
		const row = await engine.create(password);
		await expect(engine.verify(row.id, "wrong long password")).rejects.toThrow("password is incorrect");
		const filename = engine.archive(row.id);
		const data = await fs.readFile(filename);
		data[70] ^= 1;
		await fs.writeFile(filename, data);
		await expect(engine.verify(row.id, password)).rejects.toThrow("archive was modified");
		await fs.writeFile(filename, data.subarray(0, 35));
		await expect(engine.verify(row.id, password)).rejects.toThrow("Invalid backup archive");
		expect(await engine.pending()).toBeNull();
		expect(await fs.readFile(path.join(directory, ".env"), "utf8")).toBe("GEOIP_AUTO_UPDATE=false\n");
	});
	it("does not schedule incompatible versions or failed Nginx rehearsals", async () => {
		const row = await engine.create(password);
		engine.version = "different-version";
		await expect(engine.verify(row.id, password, { schedule: true })).rejects.toThrow("incompatible");
		engine.version = "test-version";
		validate.mockRejectedValueOnce(new Error("invalid generated config"));
		await expect(engine.verify(row.id, password, { schedule: true })).rejects.toThrow("invalid generated config");
		expect(await engine.pending()).toBeNull();
	});
	it("rejects tampering with verified staging and supports cancel before restart", async () => {
		const row = await engine.create(password);
		await engine.verify(row.id, password, { schedule: true });
		const pending = await engine.pending();
		await fs.writeFile(path.join(engine.pendingWork(pending), "data/.env"), "tampered=yes\n");
		expect(await engine.apply()).toBe(false);
		expect((await engine.pending()).phase).toBe("rejected");
		expect(await fs.readFile(path.join(directory, ".env"), "utf8")).toBe("GEOIP_AUTO_UPDATE=false\n");
		await engine.cancel();
		expect(await engine.pending()).toBeNull();
	});
	it("rolls back a failed activation and an uncommitted startup before another boot", async () => {
		const row = await engine.create(password);
		await fs.writeFile(path.join(directory, ".env"), "LIVE=newer\n");
		await engine.verify(row.id, password, { schedule: true });
		const originalRename = fs.rename.bind(fs);
		let injected = false;
		vi.spyOn(fs, "rename").mockImplementation(async (source, target) => {
			if (!injected && String(source).includes("/data/.env")) {
				injected = true;
				throw new Error("injected disk failure");
			}
			return originalRename(source, target);
		});
		await expect(engine.apply()).rejects.toThrow("injected disk failure");
		expect(await fs.readFile(path.join(directory, ".env"), "utf8")).toBe("LIVE=newer\n");
		expect(await engine.pending()).toBeNull();
		vi.restoreAllMocks();
		await engine.verify(row.id, password, { schedule: true });
		await engine.apply();
		expect(await fs.readFile(path.join(directory, ".env"), "utf8")).toBe("GEOIP_AUTO_UPDATE=false\n");
		await engine.apply();
		expect(await fs.readFile(path.join(directory, ".env"), "utf8")).toBe("LIVE=newer\n");
		expect(await engine.pending()).toBeNull();
	});
	it("refuses links outside the instance", async () => {
		await fs.symlink("/etc/passwd", path.join(directory, "outside"));
		await expect(engine.create(password)).rejects.toThrow("outside its data directory");
	});
	it.skipIf(!process.env.NGINX_BIN)(
		"does not rewrite the staged instance during a real Nginx syntax rehearsal",
		async () => {
			const binary = process.env.NGINX_BIN;
			const original = path.join(directory, "master-conf");
			await fs.mkdir(original);
			const data = path.join(directory, "staged");
			await fs.mkdir(path.join(data, "nginx"), { recursive: true });
			await fs.mkdir(path.join(data, "logs"));
			const host =
				"server { listen 127.0.0.1:48481; access_log /data/logs/test.log; location / { return 200; } }\n";
			await fs.writeFile(path.join(data, "nginx/host.conf"), host);
			await fs.writeFile(
				path.join(original, "nginx.conf"),
				"user root;\nerror_log stderr;\npid /run/shieldpm/nginx/nginx.pid;\nevents {}\nhttp { include /data/nginx/*.conf; }\n",
			);
			vi.stubEnv("NGINX_BIN", binary);
			vi.stubEnv("NGINX_CONF_DIRECTORY", original);
			try {
				await engine.nginxCheck(data, directory);
				expect(await fs.readFile(path.join(data, "nginx/host.conf"), "utf8")).toBe(host);
			} finally {
				vi.unstubAllEnvs();
			}
		},
	);
	it("bounds subprocess duration and never includes credential-bearing stderr", async () => {
		await expect(
			backupCommand(process.execPath, ["-e", "process.stderr.write('synthetic-secret');process.exit(2)"]),
		).rejects.toThrow(/^Backup tool failed:/);
		await expect(
			backupCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 40 }),
		).rejects.toThrow("Backup tool failed");
		await expect(backupCommand("/no/such/backup-tool", [])).rejects.toThrow("unavailable");
	});
});
