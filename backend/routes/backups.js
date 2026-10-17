import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import express from "express";
import fileUpload from "express-fileupload";
import rateLimit from "express-rate-limit";
import internalBackups from "../internal/instance-backups.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { MAX_BACKUP_BYTES } from "../lib/instance-backup.js";
import apiValidator from "../lib/validator/api.js";
import schema from "../schema/components/instance-backup-input.json" with { type: "json" };

const router = express.Router({ caseSensitive: true, strict: true });
router.use(jwtdecode());
router.use(async (_req, res, next) => {
	res.setHeader("Cache-Control", "no-store");
	await res.locals.access.can("settings:update");
	next();
});
const sensitive = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
// Backup payloads contain passwords; validation diagnostics must not retain the raw body.
const validatedInput = async (payload) => {
	try {
		return await apiValidator(schema, payload);
	} catch {
		throw new errs.ValidationError("Invalid backup request");
	}
};
const identifier = (value) => {
	if (
		typeof value !== "string" ||
		value.length !== 36 ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
	)
		throw new errs.ValidationError("Invalid backup identifier");
	return value;
};
/** Multipart paths are library-generated, but only a direct child of our private upload root is accepted. */
export const confinedUploadPath = (directory, filename) => {
	if (typeof filename !== "string" || !path.isAbsolute(filename))
		throw new errs.ValidationError("Invalid temporary archive path");
	const root = path.resolve(directory);
	const candidate = path.resolve(filename);
	if (!candidate.startsWith(`${root}${path.sep}`) || path.dirname(candidate) !== root)
		throw new errs.ValidationError("Invalid temporary archive path");
	return candidate;
};
router.get("/", async (_req, res) => res.send(await internalBackups.list(res.locals.access)));
router.post("/", sensitive, async (req, res) =>
	res.status(202).send(await internalBackups.create(res.locals.access, await validatedInput(req.body))),
);
router.delete("/pending", async (_req, res) => res.send(await internalBackups.cancel(res.locals.access)));
/** Own the request stream and parser so abort/error cleanup also ends active temporary writers. */
const multipartArchive = (req, res, directory) =>
	new Promise((resolve, reject) => {
		let settled = false;
		let parser;
		const files = new Set();
		const invalid = () => new errs.ValidationError("Invalid multipart archive");
		const finish = (error = null) => {
			if (settled) return;
			settled = true;
			req.off("aborted", abort);
			res.off("close", closed);
			req.unpipe(input);
			input.unpipe();
			if (error) {
				for (const file of files) if (!file.destroyed) file.destroy(invalid());
				parser?.destroy();
				input.destroy();
				req.resume();
				reject(error instanceof errs.ValidationError ? error : invalid());
			} else resolve(input.files);
		};
		const abort = () => finish(invalid());
		const closed = () => {
			if (!res.writableFinished) abort();
		};
		class UploadInput extends PassThrough {
			headers = req.headers;
			method = req.method;
			files = null;
			pipe(destination, options) {
				parser = destination;
				destination.on("filesLimit", () => finish(invalid()));
				destination.on("file", (_field, file) => {
					files.add(file);
					file.once("close", () => files.delete(file));
					file.once("limit", () =>
						finish(Object.assign(new errs.ValidationError("Archive too large"), { status: 413 })),
					);
				});
				return super.pipe(destination, options);
			}
		}
		const input = new UploadInput();
		input.on("error", abort);
		req.once("aborted", abort);
		res.once("close", closed);
		try {
			fileUpload({
				useTempFiles: true,
				tempFileDir: directory,
				tempFilePermissions: 0o600,
				limits: { fileSize: MAX_BACKUP_BYTES, files: 1 },
				abortOnLimit: false,
				createParentPath: false,
			})(input, res, finish);
			if (!settled) req.pipe(input);
			if (req.aborted || res.destroyed) abort();
		} catch (error) {
			finish(error);
		}
	});
router.post("/upload", sensitive, async (req, res) => {
	const release = await internalBackups.claimUpload(res.locals.access);
	let directory;
	let handle;
	let source;
	let row;
	const abort = () => {
		if (!res.writableFinished) source?.destroy(new Error("Upload cancelled"));
	};
	res.once("close", abort);
	try {
		const temporary = path.resolve(process.env.DATA_PATH || "/data", "instance-backups", ".uploads");
		await fs.mkdir(temporary, { recursive: true, mode: 0o700 });
		const info = await fs.lstat(temporary);
		if (!info.isDirectory() || info.isSymbolicLink())
			throw new errs.ValidationError("Invalid temporary archive directory");
		const root = await fs.realpath(temporary);
		directory = await fs.mkdtemp(path.join(root, "request-"));
		const files = await multipartArchive(req, res, directory);
		const uploaded = files?.archive;
		if (!uploaded || Object.keys(files).length !== 1 || Array.isArray(uploaded) || uploaded.truncated)
			throw new errs.ValidationError("Select one encrypted archive");
		if (req.aborted || res.destroyed) throw new errs.ValidationError("Upload cancelled");
		const filename = confinedUploadPath(directory, uploaded.tempFilePath);
		handle = await fs
			.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
			.catch(() => null);
		if (!handle || !(await handle.stat()).isFile())
			throw new errs.ValidationError("Invalid temporary archive file");
		if (req.aborted || res.destroyed) throw new errs.ValidationError("Upload cancelled");
		source = handle.createReadStream({ autoClose: false });
		// The connection can close while the service is still authorizing/opening its destination.
		source.on("error", () => {});
		row = await internalBackups.upload(res.locals.access, source);
	} finally {
		res.off("close", abort);
		source?.destroy();
		try {
			await handle?.close();
		} finally {
			try {
				if (directory) await fs.rm(directory, { recursive: true, force: true });
			} finally {
				release();
			}
		}
	}
	res.status(201).send(row);
});
router.get("/:id/download", async (req, res) => {
	const id = identifier(req.params.id);
	res.setHeader("Cache-Control", "no-store");
	const { stream, size } = await internalBackups.download(res.locals.access, id);
	res.attachment(`shieldpm-${id}.spmb`);
	res.setHeader("Content-Length", size);
	await pipeline(stream, res);
});
router.delete("/:id", async (req, res) =>
	res.send(await internalBackups.remove(res.locals.access, identifier(req.params.id))),
);
router.post("/:id/preflight", sensitive, async (req, res) =>
	res
		.status(202)
		.send(
			await internalBackups.preflight(
				res.locals.access,
				identifier(req.params.id),
				await validatedInput(req.body),
			),
		),
);
router.post("/:id/restore", sensitive, async (req, res) =>
	res
		.status(202)
		.send(
			await internalBackups.restore(res.locals.access, identifier(req.params.id), await validatedInput(req.body)),
		),
);
export default router;
