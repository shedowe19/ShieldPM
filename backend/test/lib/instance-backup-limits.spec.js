import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMaxBackupBytes, InstanceBackup } from "../../lib/instance-backup.js";

describe("instance backup size ceiling and staging cleanup", () => {
	let directory;
	let engine;
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-backup-limits-"));
		engine = new InstanceBackup({ directory, config: { engine: "knex-native" } });
		await engine.initialize();
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		await fs.rm(directory, { recursive: true, force: true });
	});

	it("defaults to 64 GiB and accepts a bounded environment override", () => {
		vi.stubEnv("BACKUP_MAX_BYTES", "");
		expect(getMaxBackupBytes()).toBe(64 * 1024 ** 3);
		vi.stubEnv("BACKUP_MAX_BYTES", String(2 * 1024 ** 3));
		expect(getMaxBackupBytes()).toBe(2 * 1024 ** 3);
		vi.stubEnv("BACKUP_MAX_BYTES", "1");
		expect(getMaxBackupBytes()).toBe(1024 ** 3);
		vi.stubEnv("BACKUP_MAX_BYTES", "not-a-number");
		expect(getMaxBackupBytes()).toBe(64 * 1024 ** 3);
	});

	it("fails before creating a partial archive when the measured instance is too large", async () => {
		vi.stubEnv("BACKUP_MAX_BYTES", String(1024 ** 3));
		vi.spyOn(engine, "measureData").mockResolvedValue({ bytes: 2 * 1024 ** 3, files: 1 });
		vi.spyOn(engine, "databaseBytes").mockResolvedValue(0);
		vi.spyOn(engine, "requireSpace").mockResolvedValue();
		await expect(engine.preflightSize()).rejects.toThrow("exceeds the configured backup limit");
		expect(await engine.list()).toEqual([]);
	});

	it("keeps an active or failed restore but removes completed staging trees", async () => {
		const completed = path.join(engine.store, ".restore-completed");
		const failed = path.join(engine.store, ".restore-failed");
		const active = path.join(engine.store, ".restore-active");
		for (const work of [completed, failed, active]) await fs.mkdir(work, { recursive: true });
		await fs.writeFile(path.join(completed, "completed.json"), "{}");
		await fs.writeFile(path.join(failed, "failed.json"), "{}");
		await fs.writeFile(path.join(active, "verified.json"), "{}");
		await fs.writeFile(
			path.join(engine.store, "pending.json"),
			JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", work: ".restore-active", phase: "pending" }),
		);
		await engine.cleanupCompletedRestores();
		expect(new Set(await fs.readdir(engine.store))).toEqual(
			new Set([".restore-active", ".restore-failed", "pending.json"]),
		);
	});
});
