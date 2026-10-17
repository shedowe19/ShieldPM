import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
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
	if (!/^[0-9a-f-]{36}$/.test(value)) throw new errs.ValidationError("Invalid backup identifier");
	return value;
};
router.get("/", async (_req, res) => res.send(await internalBackups.list(res.locals.access)));
router.post("/", sensitive, async (req, res) =>
	res.status(202).send(await internalBackups.create(res.locals.access, await validatedInput(req.body))),
);
router.delete("/pending", async (_req, res) => res.send(await internalBackups.cancel(res.locals.access)));
router.post(
	"/upload",
	sensitive,
	async (req, res, next) => {
		const release = await internalBackups.claimUpload(res.locals.access);
		res.once("finish", release);
		res.once("close", release);
		const temporary = path.join(process.env.DATA_PATH || "/data", "instance-backups", ".uploads");
		await fs.mkdir(temporary, { recursive: true, mode: 0o700 });
		fileUpload({
			useTempFiles: true,
			tempFileDir: temporary,
			limits: { fileSize: MAX_BACKUP_BYTES, files: 1 },
			abortOnLimit: true,
			createParentPath: false,
		})(req, res, next);
	},
	async (req, res) => {
		const uploaded = req.files?.archive;
		if (!uploaded || Array.isArray(uploaded) || uploaded.truncated)
			throw new errs.ValidationError("Select one encrypted archive");
		try {
			res.status(201).send(
				await internalBackups.upload(res.locals.access, createReadStream(uploaded.tempFilePath)),
			);
		} finally {
			await fs.rm(uploaded.tempFilePath, { force: true });
		}
	},
);
router.get("/:id/download", async (req, res) => {
	const id = identifier(req.params.id);
	res.setHeader("Cache-Control", "no-store");
	res.download(await internalBackups.download(res.locals.access, id), `shieldpm-${id}.spmb`);
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
