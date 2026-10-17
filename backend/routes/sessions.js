import express from "express";
import { rateLimit } from "express-rate-limit";
import sessions from "../internal/sessions.js";
import jwtdecode from "../lib/express/jwt-decode.js";

// Mounted at /tokens/sessions so the existing HTTP-only refresh cookie is sent.
const router = express.Router({ caseSensitive: true, strict: true });
const limiter = rateLimit({
	windowMs: 60_000,
	limit: 20,
	standardHeaders: true,
	legacyHeaders: false,
	validate: { trustProxy: false },
});
router.use(jwtdecode());
router.get("/", async (req, res) => res.json(await sessions.list(res.locals.access, req.cookies?.shieldpm_refresh)));
router.delete("/others", limiter, async (req, res) =>
	res.json(await sessions.revokeOthers(res.locals.access, req.cookies?.shieldpm_refresh)),
);
router.delete("/:family_id", limiter, async (req, res) =>
	res.json(await sessions.revoke(res.locals.access, req.cookies?.shieldpm_refresh, req.params.family_id)),
);
export default router;
