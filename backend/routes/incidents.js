import express from "express";
import incidents from "../internal/incidents.js";
import { isDemoMode } from "../lib/config.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import muteSchema from "../schema/components/alarm-mute-window.json" with { type: "json" };
import targetSchema from "../schema/components/notification-target-input.json" with { type: "json" };

const router = express.Router({ mergeParams: true });
router.use(jwtdecode());
router.use((req, _res, next) => {
	if (isDemoMode() && req.method !== "GET")
		throw new errs.PermissionError("Notification changes are disabled in Demo Mode");
	next();
});
router.get("/hosts", async (_req, res) => res.json(await incidents.hosts(res.locals.access)));
router.get("/hosts/:id", async (req, res) =>
	res.json(await incidents.hostDetail(res.locals.access, req.params.id, req.query.days || 30)),
);
router.put("/hosts/:id/mute", async (req, res) => {
	const data =
		req.body?.clear === true && Object.keys(req.body).length === 1
			? null
			: await apiValidator(muteSchema, req.body);
	res.json(await incidents.setMute(res.locals.access, req.params.id, data));
});
router.get("/targets", async (_req, res) => res.json(await incidents.targets(res.locals.access)));
router.post("/targets", async (req, res) =>
	res
		.status(201)
		.json(await incidents.saveTarget(res.locals.access, null, await apiValidator(targetSchema, req.body))),
);
router.put("/targets/:id", async (req, res) =>
	res.json(await incidents.saveTarget(res.locals.access, req.params.id, await apiValidator(targetSchema, req.body))),
);
router.delete("/targets/:id", async (req, res) =>
	res.json({ success: await incidents.deleteTarget(res.locals.access, req.params.id) }),
);
router.get("/deliveries", async (_req, res) => res.json(await incidents.deliveries(res.locals.access)));
router.post("/deliveries/:id/retry", async (req, res) =>
	res.json({ success: await incidents.retry(res.locals.access, req.params.id) }),
);
router.get("/", async (req, res) => res.json(await incidents.list(res.locals.access, req.query)));
export default router;
