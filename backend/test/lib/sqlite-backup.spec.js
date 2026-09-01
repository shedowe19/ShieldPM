import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
	createVerifiedSqliteBackup,
	restoreVerifiedSqliteBackup,
	verifySqliteDatabase,
} from "../../lib/sqlite-backup.js";

const temporaryDirectories = [];
const fixture = () => {
	const directory = fs.mkdtempSync(path.join(process.cwd(), ".sqlite-backup-test-"));
	fs.chmodSync(directory, 0o700);
	temporaryDirectories.push(directory);
	const source = path.join(directory, "database.sqlite");
	const database = new Database(source);
	database.exec("CREATE TABLE values_for_test (value TEXT NOT NULL); INSERT INTO values_for_test VALUES ('before')");
	database.close();
	return { directory, source, backups: path.join(directory, "backups") };
};

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("verified SQLite snapshots", () => {
	it("creates an online private backup and restores it atomically", async () => {
		const { source, backups } = fixture();
		const liveDatabase = new Database(source);
		liveDatabase.pragma("journal_mode = WAL");
		liveDatabase.prepare("UPDATE values_for_test SET value = 'online'").run();
		const backup = await createVerifiedSqliteBackup({ source, destinationDirectory: backups, retention: 2 });

		expect(fs.statSync(backup).mode & 0o777).toBe(0o600);
		expect(fs.statSync(backups).mode & 0o777).toBe(0o700);
		expect(() => verifySqliteDatabase(backup)).not.toThrow();

		liveDatabase.prepare("UPDATE values_for_test SET value = 'after'").run();
		liveDatabase.close();
		fs.writeFileSync(`${source}-wal`, "stale", { mode: 0o600 });
		fs.writeFileSync(`${source}-shm`, "stale", { mode: 0o600 });
		await restoreVerifiedSqliteBackup({ backup, destination: source });
		expect(fs.existsSync(`${source}-wal`)).toBe(false);
		expect(fs.existsSync(`${source}-shm`)).toBe(false);

		const restored = new Database(source, { readonly: true });
		expect(restored.prepare("SELECT value FROM values_for_test").pluck().get()).toBe("online");
		restored.close();
	});

	it("rotates only completed verified snapshots", async () => {
		const { source, backups } = fixture();
		await createVerifiedSqliteBackup({ source, destinationDirectory: backups, retention: 2 });
		await createVerifiedSqliteBackup({ source, destinationDirectory: backups, retention: 2 });
		await createVerifiedSqliteBackup({ source, destinationDirectory: backups, retention: 2 });
		const published = fs.readdirSync(backups).filter((name) => name.endsWith(".sqlite"));
		expect(published).toHaveLength(2);
		expect(fs.readdirSync(backups).some((name) => name.endsWith(".partial"))).toBe(false);
	});

	it("fails closed on invalid retention and does not publish a corrupt image", async () => {
		const { directory, source, backups } = fixture();
		await expect(
			createVerifiedSqliteBackup({ source, destinationDirectory: backups, retention: 0 }),
		).rejects.toThrow(/retention/);

		const corrupt = path.join(directory, "corrupt.sqlite");
		fs.writeFileSync(corrupt, "not a sqlite database", { mode: 0o600 });
		await expect(
			createVerifiedSqliteBackup({ source: corrupt, destinationDirectory: backups, retention: 2 }),
		).rejects.toThrow();
		expect(fs.readdirSync(backups).some((name) => name.endsWith(".partial"))).toBe(false);
	});
});
