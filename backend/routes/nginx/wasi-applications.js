import express from "express";
import rateLimit from "express-rate-limit";
import applications from "../../internal/wasi-applications.js";
import { MAX_MODULE_BYTES } from "../../internal/wasm-modules.js";

const router = express.Router({ caseSensitive: true, strict: true });
router.use(async (_req, res, next) => {
	res.setHeader("Cache-Control", "no-store");
	await res.locals.access.can("settings:update");
	next();
});
const limiter = rateLimit({ windowMs: 60_000, limit: 20, validate: { trustProxy: false } });
router.get("/", async (_req, res) => res.send(await applications.list(res.locals.access)));
router.post(
	"/",
	limiter,
	express.raw({ type: ["application/wasm", "application/octet-stream"], limit: MAX_MODULE_BYTES, inflate: false }),
	async (req, res) => {
		res.status(201).send(
			await applications.upload(res.locals.access, req.body, {
				name: req.query.name,
				filename: req.query.filename,
			}),
		);
	},
);
router.delete("/:id", async (req, res) => res.send(await applications.remove(res.locals.access, req.params.id)));
router.post("/:id/run", limiter, express.json({ limit: "1mb", strict: true }), async (req, res) => {
	const controller = new AbortController();
	const closed = () => {
		if (!res.writableEnded) controller.abort();
	};
	req.once("aborted", closed);
	res.once("close", closed);
	if (req.aborted || res.destroyed) controller.abort();
	try {
		const result = await applications.run(res.locals.access, req.params.id, req.body, {
			signal: controller.signal,
		});
		if (!res.destroyed) res.send(result);
	} finally {
		req.off("aborted", closed);
		res.off("close", closed);
	}
});
export default router;
