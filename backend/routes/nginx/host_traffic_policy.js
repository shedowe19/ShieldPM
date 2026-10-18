import express from "express";
import rateLimit from "express-rate-limit";
import service from "../../internal/host-traffic-policy.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import validator from "../../lib/validator/index.js";

const router = express.Router({ mergeParams: true, caseSensitive: true, strict: true });
const bounded = rateLimit({
	windowMs: 60_000,
	limit: 12,
	standardHeaders: true,
	legacyHeaders: false,
	validate: { trustProxy: false },
});
const idSchema = {
	type: "object",
	required: ["id"],
	additionalProperties: false,
	properties: { id: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } },
};
const purgeSchema = {
	type: "object",
	additionalProperties: false,
	properties: { path: { type: "string", minLength: 1, maxLength: 2048 } },
};
const idFor = async (req) => (await validator(idSchema, { id: req.params.host_id })).id;
router.use(jwtdecode());
router.get("/upstream-pool/status", bounded, async (req, res) =>
	res.send(await service.poolStatus(res.locals.access, await idFor(req))),
);
router.get("/cache/status", async (req, res) =>
	res.send(await service.cacheStatus(res.locals.access, await idFor(req))),
);
router.delete("/cache", bounded, async (req, res) => {
	if (
		Object.keys(req.query).some((key) => key !== "path") ||
		(req.query.path !== undefined && typeof req.query.path !== "string")
	)
		throw new errs.ValidationError("Invalid cache purge query");
	await validator(purgeSchema, req.query);
	res.send(await service.purgeCache(res.locals.access, await idFor(req), { path: req.query.path }));
});
export default router;
