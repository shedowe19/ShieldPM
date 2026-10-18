import express from "express";
import rateLimit from "express-rate-limit";
import internalWasm from "../../internal/wasm.js";
import internalModules, { MAX_MODULE_BYTES } from "../../internal/wasm-modules.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import applicationRoutes from "./wasi-applications.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });
const limiter = rateLimit({ windowMs: 60_000, limit: 3, validate: { trustProxy: false } });
router.use(jwtdecode());
router.use((_req, res, next) => {
	res.setHeader("Cache-Control", "no-store");
	next();
});
router.use("/applications", applicationRoutes);
router.get("/modules", async (_req, res) => res.send(await internalModules.list(res.locals.access)));
router.post(
	"/modules",
	limiter,
	async (_req, res, next) => {
		await res.locals.access.can("settings:update");
		next();
	},
	express.raw({ type: ["application/wasm", "application/octet-stream"], limit: MAX_MODULE_BYTES, inflate: false }),
	async (req, res) => {
		res.status(201).send(
			await internalModules.upload(res.locals.access, req.body, {
				name: req.query.name,
				filename: req.query.filename,
			}),
		);
	},
);
router.get("/modules/:id", async (req, res) => res.send(await internalModules.get(res.locals.access, req.params.id)));
router.delete("/modules/:id", async (req, res) =>
	res.send(await internalModules.remove(res.locals.access, req.params.id)),
);
router.get("/", async (_req, res) => {
	await res.locals.access.can("proxy_hosts:list");
	res.send(await internalWasm.capabilities());
});
router.post("/self-test", limiter, async (_req, res) => {
	await res.locals.access.can("settings:update");
	res.send(await internalWasm.selfTest());
});
router.get("/hosts/:id", async (req, res) => {
	const id = Number(req.params.id);
	if (!Number.isSafeInteger(id) || id < 1) throw new errs.ValidationError("Invalid host identifier");
	const access = res.locals.access;
	const permissions = await access.can("proxy_hosts:get", id);
	const { default: ProxyHost } = await import("../../models/proxy_host.js");
	const query = ProxyHost.query().select("id").findById(id).where("is_deleted", 0);
	if (permissions.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
	if (!(await query)) throw new errs.ItemNotFoundError(id);
	res.send(await internalWasm.getHostStatus(id));
});
export default router;
