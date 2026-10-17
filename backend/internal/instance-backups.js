import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { configGet, isDemoMode } from "../lib/config.js";
import errs from "../lib/error.js";
import { InstanceBackup, MAX_BACKUP_BYTES, privateJson } from "../lib/instance-backup.js";
import internalAuditLog from "./audit-log.js";
import internalNginx from "./nginx.js";

let engine;
let activeJob = null;
let uploading = false;
const jobs = new Map();
const backupEngine = () =>
	(engine ||= new InstanceBackup({
		config: configGet("database"),
		snapshotLock: (callback) => internalNginx.withConfigurationLock(callback),
	}));
const authorize = async (access) => {
	await access.can("settings:update");
	if (isDemoMode()) throw new errs.PermissionError("Instance backups are disabled in demo mode");
};
const publicFailure = (phase) =>
	`Backup ${phase} failed. Verify the password, archive compatibility, available space and database client permissions.`;
const audit = (access, action, operation, id, details = {}) =>
	internalAuditLog.add(access, {
		action,
		object_type: "setting",
		object_id: 0,
		meta: { setting_id: "instance-backups", operation, backup_id: id, ...details },
	});
const runJob = async (kind, operation) => {
	if (activeJob || uploading)
		throw new errs.ValidationError("Another instance backup or restore operation is running");
	const job = {
		id: crypto.randomUUID(),
		kind,
		phase: "queued",
		status: "running",
		created_on: new Date().toISOString(),
		result: null,
		error: null,
	};
	activeJob = job;
	jobs.set(job.id, job);
	// Keep only bounded public job history; passwords never enter persistent job data.
	if (jobs.size > 50) jobs.delete(jobs.keys().next().value);
	const progress = (phase) => {
		job.phase = phase;
	};
	void Promise.resolve()
		.then(() => operation(progress))
		.then((result) => {
			job.result = result;
			job.status = "completed";
			job.phase = "completed";
		})
		.catch(() => {
			job.error = publicFailure(job.phase);
			job.status = "failed";
		})
		.finally(() => {
			activeJob = null;
		});
	return { ...job };
};

const internalBackups = {
	/** Admin-only catalog. No database credentials, file paths or manifest secrets are exposed. */
	async list(access) {
		await authorize(access);
		const instance = backupEngine();
		const pending = await instance.pending();
		return {
			backups: await instance.list(),
			jobs: [...jobs.values()].reverse(),
			pending: pending ? { id: pending.id, phase: pending.phase, created_on: pending.created_on } : null,
			limits: { max_bytes: MAX_BACKUP_BYTES },
			activation: "next_restart",
		};
	},
	/** Snapshot and encrypt one complete instance under the global configuration lock. */
	async create(access, data) {
		await authorize(access);
		let password = data.password;
		return runJob("create", async (progress) => {
			try {
				const row = await backupEngine().create(password, data.name, progress);
				await audit(access, "created", "backup_created", row.id, { name: row.name, provider: row.database });
				return row;
			} finally {
				password = null;
			}
		});
	},
	/** Decrypt, hash-check and perform an isolated database/Nginx restore rehearsal. */
	async preflight(access, id, data) {
		await authorize(access);
		let password = data.password;
		return runJob("preflight", async (progress) => {
			try {
				return await backupEngine().verify(id, password, { progress });
			} finally {
				password = null;
			}
		});
	},
	/** Stage verified state for the next process/container restart, never replace live databases. */
	async restore(access, id, data) {
		await authorize(access);
		if (data.confirmation !== `RESTORE ${id}`)
			throw new errs.ValidationError("Restore confirmation does not match the selected backup");
		await audit(access, "updated", "restore_requested", id);
		let password = data.password;
		return runJob("restore", async (progress) => {
			try {
				return await backupEngine().verify(id, password, {
					schedule: true,
					progress,
					beforeSchedule: async () => {
						await audit(access, "updated", "restore_validated", id);
					},
				});
			} finally {
				password = null;
			}
		});
	},
	/** Cancel an inactive pending restore, including its isolated external database. */
	async cancel(access) {
		await authorize(access);
		if (activeJob || uploading) throw new errs.ValidationError("Wait for the current backup operation to finish");
		await audit(access, "updated", "restore_cancel_requested", (await backupEngine().pending())?.id || "none");
		await internalNginx.withConfigurationLock(() => backupEngine().cancel());
		return { canceled: true };
	},
	/** Remove a stored encrypted archive after any pending restore was canceled. */
	async remove(access, id) {
		await authorize(access);
		if (activeJob || uploading) throw new errs.ValidationError("Wait for the current backup operation to finish");
		await audit(access, "deleted", "backup_delete_requested", id);
		await backupEngine().remove(id);
		return { deleted: true };
	},
	/** Reserve the single operation slot before accepting an archive request body. */
	async claimUpload(access) {
		await authorize(access);
		if (activeJob || uploading) throw new errs.ValidationError("Wait for the current backup operation to finish");
		uploading = true;
		try {
			if ((await backupEngine().list()).length >= 50)
				throw new errs.ValidationError("Remove an older backup before importing another archive");
		} catch (error) {
			uploading = false;
			throw error;
		}
		let released = false;
		return () => {
			if (!released) {
				released = true;
				uploading = false;
			}
		};
	},
	/** Authorize an encrypted archive download. */
	async download(access, id) {
		await authorize(access);
		const filename = backupEngine().archive(id);
		const info = await fs.lstat(filename).catch(() => null);
		if (!info?.isFile() || info.isSymbolicLink()) throw new errs.ItemNotFoundError(id);
		return filename;
	},
	/** Persist an uploaded encrypted archive without buffering it into server memory. */
	async upload(access, request) {
		await authorize(access);
		if (activeJob) throw new errs.ValidationError("Wait for the current backup operation to finish");
		const instance = backupEngine();
		await instance.initialize();
		const id = crypto.randomUUID();
		const filename = instance.archive(id);
		const temporary = `${filename}.tmp`;
		let size = 0;
		const limit = new Transform({
			transform(chunk, _encoding, callback) {
				size += chunk.length;
				callback(size > MAX_BACKUP_BYTES ? new Error("Archive too large") : null, chunk);
			},
		});
		try {
			await pipeline(request, limit, createWriteStream(temporary, { flags: "wx", mode: 0o600, flush: true }));
			const header = await fs.open(temporary, "r");
			const magic = Buffer.alloc(8);
			try {
				await header.read(magic, 0, 8, 0);
			} finally {
				await header.close();
			}
			if (!magic.equals(Buffer.from("SPMBKP01")) || size < 52)
				throw new errs.ValidationError("Unsupported encrypted backup archive");
			await fs.rename(temporary, filename);
			const row = {
				id,
				name: "Imported backup",
				created_on: new Date().toISOString(),
				app_version: null,
				database: null,
				size,
			};
			await privateJson(path.join(instance.store, `${id}.json`), row);
			await audit(access, "created", "backup_imported", id);
			return row;
		} finally {
			await fs.rm(temporary, { force: true });
		}
	},
	/** Called only after migrations, generated configuration and the backend socket are ready. */
	async commitStartupRestore() {
		const instance = backupEngine();
		const pending = await instance.pending();
		if (pending?.phase !== "activated") return false;
		await audit({ token: { getUserId: () => 0 } }, "updated", "restore_activated", pending.id);
		return instance.commit();
	},
};

export default internalBackups;
