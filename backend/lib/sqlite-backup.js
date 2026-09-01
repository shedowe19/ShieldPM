import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_DATABASE = `${process.env.DATA_PATH || "/data"}/shieldpm/database.sqlite`;
const DEFAULT_BACKUP_DIRECTORY = `${process.env.DATA_PATH || "/data"}/shieldpm/backups`;
const DEFAULT_RETENTION = 7;

const assertRegularFile = (filename, label) => {
	const stat = fs.lstatSync(filename);
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error(`${label} must be a regular non-symlink file: ${filename}`);
	}
	return stat;
};

const ensurePrivateDirectory = (directory) => {
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	const stat = fs.lstatSync(directory);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`Backup destination must be a real directory: ${directory}`);
	}
	fs.chmodSync(directory, 0o700);
};

const fsyncPath = (filename, flags = "r") => {
	const descriptor = fs.openSync(filename, flags);
	try {
		fs.fsyncSync(descriptor);
	} finally {
		fs.closeSync(descriptor);
	}
};

/**
 * Verify the complete SQLite image, not only whether it can be opened.
 *
 * @param {string} filename
 * @returns {void}
 */
export const verifySqliteDatabase = (filename) => {
	assertRegularFile(filename, "SQLite image");
	const database = new Database(filename, { readonly: true, fileMustExist: true });
	try {
		const result = database.pragma("integrity_check");
		if (result.length !== 1 || String(result[0].integrity_check).toLowerCase() !== "ok") {
			throw new Error(`SQLite integrity_check failed for ${filename}`);
		}
	} finally {
		database.close();
	}
};

const rotateBackups = (directory, retention) => {
	const backups = fs
		.readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && /^database-\d{8}T\d{6}-[0-9a-f]{8}(?:-[\w.-]+)?\.sqlite$/.test(entry.name))
		.map((entry) => ({ name: entry.name, stat: fs.lstatSync(path.join(directory, entry.name)) }))
		.filter(({ stat }) => stat.isFile() && !stat.isSymbolicLink())
		.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

	for (const expired of backups.slice(retention)) {
		fs.unlinkSync(path.join(directory, expired.name));
	}
};

const removeIfPresent = (filename) => {
	try {
		fs.unlinkSync(filename);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
};

/**
 * Create an online SQLite backup, fsync it, run integrity_check, atomically publish it and rotate old snapshots.
 *
 * @param {{source?: string, destinationDirectory?: string, retention?: number, label?: string}} [options]
 * @returns {Promise<string>} published backup path
 */
export const createVerifiedSqliteBackup = async (options = {}) => {
	const source = path.resolve(options.source || DEFAULT_DATABASE);
	const destinationDirectory = path.resolve(options.destinationDirectory || DEFAULT_BACKUP_DIRECTORY);
	const configuredRetention = process.env.SQLITE_BACKUP_RETENTION_COUNT;
	const retention =
		options.retention ??
		(typeof configuredRetention === "undefined" || configuredRetention === ""
			? DEFAULT_RETENTION
			: Number(configuredRetention));
	if (!Number.isSafeInteger(retention) || retention < 1 || retention > 365) {
		throw new Error("SQLite backup retention must be between 1 and 365");
	}

	const sourceStat = assertRegularFile(source, "SQLite source");
	ensurePrivateDirectory(destinationDirectory);
	const stamp = new Date()
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}Z$/, "");
	const random = crypto.randomBytes(4).toString("hex");
	const label = options.label ? `-${String(options.label).replace(/[^a-zA-Z0-9_.-]/g, "_")}` : "";
	const finalPath = path.join(destinationDirectory, `database-${stamp}-${random}${label}.sqlite`);
	const temporaryPath = `${finalPath}.partial`;

	if (fs.existsSync(temporaryPath) || fs.existsSync(finalPath)) {
		throw new Error("Refusing to overwrite an existing SQLite backup");
	}

	try {
		const database = new Database(source, { readonly: true, fileMustExist: true });
		try {
			await database.backup(temporaryPath);
		} finally {
			database.close();
		}
		fs.chmodSync(temporaryPath, 0o600);
		if (typeof process.getuid === "function" && process.getuid() === 0) {
			fs.chownSync(temporaryPath, sourceStat.uid, sourceStat.gid);
		}
		verifySqliteDatabase(temporaryPath);
		fsyncPath(temporaryPath, "r");
		fs.renameSync(temporaryPath, finalPath);
		fsyncPath(destinationDirectory, "r");
		rotateBackups(destinationDirectory, retention);
		fsyncPath(destinationDirectory, "r");
		return finalPath;
	} catch (error) {
		removeIfPresent(temporaryPath);
		throw error;
	}
};

/**
 * Restore a verified snapshot using an adjacent temporary file and atomic rename.
 * The caller must stop all database writers before invoking this operation.
 *
 * @param {{backup: string, destination?: string}} options
 * @returns {Promise<string>}
 */
export const restoreVerifiedSqliteBackup = async ({ backup, destination = DEFAULT_DATABASE }) => {
	const source = path.resolve(backup);
	const target = path.resolve(destination);
	verifySqliteDatabase(source);
	ensurePrivateDirectory(path.dirname(target));

	let targetStat = null;
	if (fs.existsSync(target)) {
		targetStat = assertRegularFile(target, "SQLite restore target");
	}
	const temporaryPath = path.join(path.dirname(target), `.${path.basename(target)}.restore-${process.pid}`);
	if (fs.existsSync(temporaryPath)) {
		throw new Error(`Restore staging path already exists: ${temporaryPath}`);
	}

	try {
		const database = new Database(source, { readonly: true, fileMustExist: true });
		try {
			await database.backup(temporaryPath);
		} finally {
			database.close();
		}
		fs.chmodSync(temporaryPath, 0o600);
		if (targetStat && typeof process.getuid === "function" && process.getuid() === 0) {
			fs.chownSync(temporaryPath, targetStat.uid, targetStat.gid);
		}
		verifySqliteDatabase(temporaryPath);
		fsyncPath(temporaryPath, "r");
		for (const suffix of ["-wal", "-shm", "-journal"]) {
			const sidecar = `${target}${suffix}`;
			if (fs.existsSync(sidecar)) assertRegularFile(sidecar, "SQLite restore sidecar");
		}
		for (const suffix of ["-wal", "-shm", "-journal"]) removeIfPresent(`${target}${suffix}`);
		fs.renameSync(temporaryPath, target);
		fsyncPath(path.dirname(target), "r");
		return target;
	} catch (error) {
		removeIfPresent(temporaryPath);
		throw error;
	}
};
