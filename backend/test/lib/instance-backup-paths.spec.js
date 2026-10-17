import { execFile } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupArchivePath, backupMetadataPath, InstanceBackup } from "../../lib/instance-backup.js";

const execute = promisify(execFile);
const identifier = "11111111-1111-4111-8111-111111111111";

describe("backup archive identifier and open-file boundaries", () => {
	let directory;
	let engine;
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-backup-paths-"));
		const data = path.join(directory, "instance");
		await fs.mkdir(path.join(data, "shieldpm"), { recursive: true });
		const database = new Database(path.join(data, "shieldpm/database.sqlite"));
		database.exec(
			"CREATE TABLE migrations (name TEXT); INSERT INTO migrations VALUES ('fixture.js'); CREATE TABLE user (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO user VALUES (1,'original')",
		);
		database.close();
		await fs.writeFile(path.join(data, ".env"), "ORIGINAL=true\n");
		engine = new InstanceBackup({
			directory: data,
			config: { engine: "knex-native" },
			migrationNames: ["fixture.js"],
			validateNginx: vi.fn().mockResolvedValue(undefined),
		});
		await engine.initialize();
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.rm(directory, { recursive: true, force: true });
	});

	it("constructs independent canonical archive and metadata paths in the configured store", () => {
		expect(backupArchivePath(engine.store, identifier)).toBe(path.join(engine.store, `${identifier}.spmb`));
		expect(backupMetadataPath(engine.store, identifier)).toBe(path.join(engine.store, `${identifier}.json`));
	});

	it("rejects traversal, malformed identifiers and coercible objects before reading or removing files", async () => {
		const sentinel = path.join(directory, "victim.json");
		await fs.writeFile(sentinel, "outside file");
		const coercible = { toString: vi.fn().mockReturnValueOnce(identifier).mockReturnValue("../../victim") };
		const invalid = [
			"../victim",
			"/tmp/victim",
			"..\\victim",
			"%2e%2e%2fvictim",
			`${identifier}/..`,
			`${identifier}\n`,
			`${identifier}\0`,
			"-".repeat(36),
			"a".repeat(36),
			null,
			undefined,
			coercible,
		];
		const remove = vi.spyOn(fs, "rm");
		const open = vi.spyOn(fs, "open");
		for (const value of invalid) {
			expect(() => backupArchivePath(engine.store, value)).toThrow("Invalid backup identifier");
			expect(() => backupMetadataPath(engine.store, value)).toThrow("Invalid backup identifier");
			await expect(engine.remove(value)).rejects.toThrow("Invalid backup identifier");
			await expect(engine.decrypt(value, "synthetic long password", directory)).rejects.toThrow(
				"Invalid backup identifier",
			);
		}
		expect(coercible.toString).not.toHaveBeenCalled();
		expect(remove).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
		expect(await fs.readFile(sentinel, "utf8")).toBe("outside file");
	});

	it("authenticates and streams the same opened inode after an archive pathname becomes a symlink", async () => {
		const password = "synthetic long backup password";
		const row = await engine.create(password);
		const archive = engine.archive(row.id);
		const original = `${archive}.original`;
		const outside = path.join(directory, "outside.spmb");
		await fs.writeFile(outside, "this must never be read as archive ciphertext");
		const work = await fs.mkdtemp(path.join(engine.store, ".restore-"));
		const originalOpen = fs.open.bind(fs);
		let replaced = false;
		vi.spyOn(fs, "open").mockImplementation(async (filename, flags, mode) => {
			const handle = await originalOpen(filename, flags, mode);
			if (filename === archive && flags === (constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)) {
				const originalRead = handle.read.bind(handle);
				let reads = 0;
				vi.spyOn(handle, "read").mockImplementation(async (...args) => {
					const result = await originalRead(...args);
					if (++reads === 2) {
						await fs.rename(archive, original);
						await fs.symlink(outside, archive);
						replaced = true;
					}
					return result;
				});
			}
			return handle;
		});
		const manifest = await engine.decrypt(row.id, password, work);
		expect(replaced).toBe(true);
		expect(manifest.database.engine).toBe("sqlite");
		expect(await fs.readFile(path.join(work, "data/.env"), "utf8")).toBe("ORIGINAL=true\n");
		expect(await fs.readFile(outside, "utf8")).toBe("this must never be read as archive ciphertext");
	});

	it("rejects an archive that is already a symlink before opening it", async () => {
		const outside = path.join(directory, "outside.spmb");
		await fs.writeFile(outside, Buffer.alloc(128));
		await fs.symlink(outside, engine.archive(identifier));
		await expect(engine.decrypt(identifier, "synthetic long password", directory)).rejects.toMatchObject({
			code: "ELOOP",
		});
		expect((await fs.stat(outside)).size).toBe(128);
	});
	it("rejects a FIFO under an archive name without waiting for a writer", async () => {
		await execute("mkfifo", [engine.archive(identifier)]);
		const script = `import { InstanceBackup } from ${JSON.stringify(new URL("../../lib/instance-backup.js", import.meta.url).href)};
		const instance = new InstanceBackup({ directory: process.argv[1] });
		try { await instance.decrypt(process.argv[2], "synthetic long password", process.argv[1]); process.exitCode = 1; }
		catch (error) { if (error.message !== "Invalid backup archive") throw error; process.stdout.write("nonregular rejected"); }`;
		const result = await execute(
			process.execPath,
			["--input-type=module", "-e", script, engine.directory, identifier],
			{ timeout: 3000, maxBuffer: 1024 },
		);
		expect(result.stdout).toBe("nonregular rejected");
	});
});
