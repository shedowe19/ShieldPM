import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SPOOL_VERSION = 1;
const CHECKPOINT_VERSION = 1;
const CHECKPOINT_MAX_BYTES = 4096;
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const NO_FOLLOW = fs.constants.O_NOFOLLOW || 0;
const DIRECTORY = fs.constants.O_DIRECTORY || 0;

const checksumFor = (sequence, event) =>
	crypto.createHash("sha256").update(JSON.stringify({ event, sequence })).digest("hex");

const assertRegularFile = (filePath, stat) => {
	if (!stat.isFile() || stat.nlink !== 1) {
		throw new Error(`Analytics spool path is not a regular, single-link file: ${filePath}`);
	}
};

const assertSafeTarget = (filePath) => {
	try {
		const stat = fs.lstatSync(filePath);
		if (stat.isSymbolicLink()) {
			throw new Error(`Analytics spool path must not be a symbolic link: ${filePath}`);
		}
		assertRegularFile(filePath, stat);
	} catch (err) {
		if (err.code !== "ENOENT") {
			throw err;
		}
	}
};

const ensureSafeDirectory = (directoryPath) => {
	const parsed = path.parse(directoryPath);
	let currentPath = parsed.root;
	const segments = directoryPath.slice(parsed.root.length).split(path.sep).filter(Boolean);
	for (const segment of segments) {
		currentPath = path.join(currentPath, segment);
		try {
			const stat = fs.lstatSync(currentPath);
			if (stat.isSymbolicLink()) {
				throw new Error(`Analytics spool directory path must not contain symbolic links: ${currentPath}`);
			}
			if (!stat.isDirectory()) {
				throw new Error(`Analytics spool directory component is not a directory: ${currentPath}`);
			}
		} catch (err) {
			if (err.code === "ENOENT") break;
			throw err;
		}
	}

	fs.mkdirSync(directoryPath, { mode: DIRECTORY_MODE, recursive: true });
	currentPath = parsed.root;
	for (const segment of segments) {
		currentPath = path.join(currentPath, segment);
		const stat = fs.lstatSync(currentPath);
		if (stat.isSymbolicLink()) {
			throw new Error(`Analytics spool directory path must not contain symbolic links: ${currentPath}`);
		}
		if (!stat.isDirectory()) {
			throw new Error(`Analytics spool directory component is not a directory: ${currentPath}`);
		}
	}
	const stat = fs.lstatSync(directoryPath);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`Analytics spool directory must be a real directory: ${directoryPath}`);
	}
};

const fsyncDirectory = (directoryPath) => {
	const descriptor = fs.openSync(directoryPath, fs.constants.O_RDONLY | DIRECTORY | NO_FOLLOW);
	try {
		if (!fs.fstatSync(descriptor).isDirectory()) {
			throw new Error(`Analytics spool parent is not a directory: ${directoryPath}`);
		}
		fs.fsyncSync(descriptor);
	} finally {
		fs.closeSync(descriptor);
	}
};

const writeFully = (descriptor, buffer) => {
	let offset = 0;
	while (offset < buffer.length) {
		const written = fs.writeSync(descriptor, buffer, offset, buffer.length - offset);
		if (written <= 0) {
			throw new Error("Unable to make progress while writing the analytics spool");
		}
		offset += written;
	}
};

const secureReadFile = (filePath, maximumBytes) => {
	const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | NO_FOLLOW);
	try {
		const stat = fs.fstatSync(descriptor);
		assertRegularFile(filePath, stat);
		if (stat.size > maximumBytes) {
			throw new Error(`Analytics spool metadata exceeds its size limit: ${filePath}`);
		}
		const data = Buffer.alloc(stat.size);
		let offset = 0;
		while (offset < data.length) {
			const read = fs.readSync(descriptor, data, offset, data.length - offset, offset);
			if (read === 0) break;
			offset += read;
		}
		return data.subarray(0, offset);
	} finally {
		fs.closeSync(descriptor);
	}
};

const atomicWriteFile = (filePath, contents) => {
	const directoryPath = path.dirname(filePath);
	ensureSafeDirectory(directoryPath);
	assertSafeTarget(filePath);
	const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
	const descriptor = fs.openSync(
		temporaryPath,
		fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NO_FOLLOW,
		FILE_MODE,
	);
	try {
		const stat = fs.fstatSync(descriptor);
		assertRegularFile(temporaryPath, stat);
		writeFully(descriptor, Buffer.isBuffer(contents) ? contents : Buffer.from(contents));
		fs.fsyncSync(descriptor);
	} catch (err) {
		try {
			fs.unlinkSync(temporaryPath);
		} catch (_) {
			// The original write error is more useful than a best-effort cleanup error.
		}
		throw err;
	} finally {
		fs.closeSync(descriptor);
	}

	try {
		fs.renameSync(temporaryPath, filePath);
		fsyncDirectory(directoryPath);
	} catch (err) {
		try {
			fs.unlinkSync(temporaryPath);
		} catch (_) {
			// The original rename/fsync error is authoritative.
		}
		throw err;
	}
};

const parsePositiveInteger = (value, name, fallback) => {
	if (value === undefined || value === null || value === "") return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive safe integer`);
	}
	return parsed;
};

export class DurableAnalyticsSpool {
	/**
	 * @param {string} spoolPath
	 * @param {{maxBytes?: number|string, recordMaxBytes?: number|string}} [options]
	 */
	constructor(spoolPath, options = {}) {
		if (!path.isAbsolute(spoolPath)) {
			throw new Error("ANALYTICS_SPOOL_PATH must be absolute");
		}
		this.path = path.normalize(spoolPath);
		this.checkpointPath = `${this.path}.checkpoint`;
		this.maxBytes = parsePositiveInteger(options.maxBytes, "ANALYTICS_SPOOL_MAX_BYTES", 64 * 1024 * 1024);
		this.recordMaxBytes = parsePositiveInteger(
			options.recordMaxBytes,
			"ANALYTICS_SPOOL_RECORD_MAX_BYTES",
			256 * 1024,
		);
		if (this.recordMaxBytes > this.maxBytes) {
			throw new Error("ANALYTICS_SPOOL_RECORD_MAX_BYTES must not exceed ANALYTICS_SPOOL_MAX_BYTES");
		}
		this.descriptor = null;
		this.fileSize = 0;
		this.queueBytes = 0;
		this.queue = [];
		this.lastCheckpointSequence = 0;
		this.nextSequence = 1;
	}

	get pendingCount() {
		return this.queue.length;
	}

	open() {
		if (this.descriptor !== null) return;

		const directoryPath = path.dirname(this.path);
		ensureSafeDirectory(directoryPath);
		assertSafeTarget(this.path);
		assertSafeTarget(this.checkpointPath);
		this.lastCheckpointSequence = this.readCheckpoint();

		this.descriptor = fs.openSync(
			this.path,
			fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | NO_FOLLOW,
			FILE_MODE,
		);
		try {
			const stat = fs.fstatSync(this.descriptor);
			assertRegularFile(this.path, stat);
			if (stat.size > this.maxBytes) {
				throw new Error("Analytics spool is larger than ANALYTICS_SPOOL_MAX_BYTES");
			}
			fs.fchmodSync(this.descriptor, FILE_MODE);
			this.loadRecords(stat.size);
		} catch (err) {
			fs.closeSync(this.descriptor);
			this.descriptor = null;
			throw err;
		}
	}

	readCheckpoint() {
		try {
			const raw = secureReadFile(this.checkpointPath, CHECKPOINT_MAX_BYTES).toString("utf8");
			const checkpoint = JSON.parse(raw);
			if (
				checkpoint.version !== CHECKPOINT_VERSION ||
				!Number.isSafeInteger(checkpoint.last_sequence) ||
				checkpoint.last_sequence < 0
			) {
				throw new Error("Invalid analytics spool checkpoint");
			}
			return checkpoint.last_sequence;
		} catch (err) {
			if (err.code === "ENOENT") return 0;
			throw err;
		}
	}

	loadRecords(expectedSize) {
		const data = secureReadFile(this.path, this.maxBytes);
		let cursor = 0;
		let lastSequence = 0;
		let lastCompleteOffset = 0;
		this.queue = [];
		this.queueBytes = 0;

		while (cursor < data.length) {
			const newline = data.indexOf(0x0a, cursor);
			if (newline === -1) break;
			const line = data.subarray(cursor, newline + 1);
			const record = this.parseRecord(line);
			if (record.sequence <= lastSequence) {
				throw new Error("Analytics spool sequence numbers are not strictly increasing");
			}
			lastSequence = record.sequence;
			lastCompleteOffset = newline + 1;
			if (record.sequence > this.lastCheckpointSequence) {
				this.queue.push({ ...record, serialized: line });
				this.queueBytes += line.length;
			}
			cursor = newline + 1;
		}

		if (lastCompleteOffset !== data.length) {
			fs.ftruncateSync(this.descriptor, lastCompleteOffset);
			fs.fsyncSync(this.descriptor);
		}

		this.fileSize = lastCompleteOffset;
		this.nextSequence = Math.max(lastSequence, this.lastCheckpointSequence) + 1;
		if (expectedSize !== data.length) {
			throw new Error("Analytics spool changed while it was being opened");
		}
	}

	parseRecord(line) {
		if (line.length > this.recordMaxBytes) {
			throw new Error("Analytics spool contains an oversized record");
		}
		let record;
		try {
			record = JSON.parse(line.toString("utf8"));
		} catch (err) {
			throw new Error(`Analytics spool contains invalid NDJSON: ${err.message}`);
		}
		if (
			record?.version !== SPOOL_VERSION ||
			!Number.isSafeInteger(record.sequence) ||
			record.sequence <= 0 ||
			typeof record.event !== "object" ||
			record.event === null ||
			typeof record.checksum !== "string" ||
			record.checksum !== checksumFor(record.sequence, record.event)
		) {
			throw new Error("Analytics spool record failed integrity validation");
		}
		return record;
	}

	append(event) {
		if (this.descriptor === null) {
			throw new Error("Analytics spool is not open");
		}
		const sequence = this.nextSequence;
		const record = {
			version: SPOOL_VERSION,
			sequence,
			event,
			checksum: checksumFor(sequence, event),
		};
		const serialized = Buffer.from(`${JSON.stringify(record)}\n`);
		if (serialized.length > this.recordMaxBytes) {
			throw new Error("Analytics event exceeds ANALYTICS_SPOOL_RECORD_MAX_BYTES");
		}
		if (this.fileSize + serialized.length > this.maxBytes) {
			this.compact(true);
		}
		if (this.fileSize + serialized.length > this.maxBytes) {
			throw new Error("Analytics spool has reached ANALYTICS_SPOOL_MAX_BYTES");
		}

		const originalSize = this.fileSize;
		try {
			writeFully(this.descriptor, serialized);
			fs.fsyncSync(this.descriptor);
		} catch (err) {
			try {
				fs.ftruncateSync(this.descriptor, originalSize);
				fs.fsyncSync(this.descriptor);
			} catch (_) {
				// Recovery is attempted, but the write failure remains authoritative.
			}
			throw err;
		}

		this.nextSequence++;
		this.fileSize += serialized.length;
		this.queueBytes += serialized.length;
		const queued = { ...record, serialized };
		this.queue.push(queued);
		return queued;
	}

	peek(limit) {
		return this.queue.slice(0, limit);
	}

	markCommitted(lastSequence) {
		const index = this.queue.findIndex((record) => record.sequence === lastSequence);
		if (index < 0) {
			throw new Error("Cannot checkpoint a record that is not pending in the analytics spool");
		}
		const committed = this.queue.slice(0, index + 1);
		this.writeCheckpoint(lastSequence);
		this.queue.splice(0, index + 1);
		this.queueBytes -= committed.reduce((total, record) => total + record.serialized.length, 0);
		this.lastCheckpointSequence = lastSequence;
	}

	writeCheckpoint(lastSequence) {
		atomicWriteFile(
			this.checkpointPath,
			`${JSON.stringify({ version: CHECKPOINT_VERSION, last_sequence: lastSequence })}\n`,
		);
	}

	compact(force = false) {
		if (this.descriptor === null) return false;
		const acknowledgedBytes = this.fileSize - this.queueBytes;
		if (!force && acknowledgedBytes < 1024 * 1024 && acknowledgedBytes < this.fileSize / 2) {
			return false;
		}

		const contents = Buffer.concat(
			this.queue.map((record) => record.serialized),
			this.queueBytes,
		);
		fs.closeSync(this.descriptor);
		this.descriptor = null;
		try {
			atomicWriteFile(this.path, contents);
			this.descriptor = fs.openSync(this.path, fs.constants.O_WRONLY | fs.constants.O_APPEND | NO_FOLLOW);
			assertRegularFile(this.path, fs.fstatSync(this.descriptor));
			this.fileSize = contents.length;
			return true;
		} catch (err) {
			if (this.descriptor === null) {
				try {
					this.descriptor = fs.openSync(this.path, fs.constants.O_WRONLY | fs.constants.O_APPEND | NO_FOLLOW);
				} catch (_) {
					// The compaction error is reported to the caller; close() remains safe.
				}
			}
			throw err;
		}
	}

	getReplayFloor() {
		return this.queue[0]?.sequence || this.lastCheckpointSequence + 1;
	}

	close() {
		if (this.descriptor !== null) {
			fs.closeSync(this.descriptor);
			this.descriptor = null;
		}
	}
}

export const analyticsSpoolInternals = {
	atomicWriteFile,
	checksumFor,
	parsePositiveInteger,
};
