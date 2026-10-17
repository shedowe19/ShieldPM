import express from "express";
import rateLimit from "express-rate-limit";
import internalWasm from "../../internal/wasm.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });
const limiter = rateLimit({ windowMs: 60_000, limit: 3, validate: { trustProxy: false } });
router.use(jwtdecode());
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
