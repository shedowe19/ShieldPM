import express from "express";
import { torList, torGet, torCreate, torUpdate, torRemove, torStart, torStop } from "../../modules/tor/index.js";
import { isDemoMode } from "../../lib/config.js";
import { asyncHandler } from "../../lib/express/route-handler.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router.use(jwtdecode());

router.use((req, res, next) => {
	if (isDemoMode() && req.method !== "GET") {
		res.status(403).send({ error: "Tor Onion Services are disabled in Demo Mode" });
		return;
	}
	next();
});

router.get(
	"/",
	asyncHandler(async (_req, res) => {
		const result = await torList(res.locals.access);
		res.status(200).send(result);
	}),
);

router.get(
	"/:id",
	asyncHandler(async (req, res) => {
		const service = await torGet(req.params.id, res.locals.access);
		if (!service) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}
		res.status(200).send(service);
	}),
);

router.post(
	"/",
	asyncHandler(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/tor-onion", "post"), req.body);
		const result = await torCreate(payload, res.locals.access);
		res.status(201).send(result);
	}),
);

router.put(
	"/:id",
	asyncHandler(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/tor-onion/{id}", "put"), req.body);
		const result = await torUpdate(req.params.id, payload, res.locals.access);
		if (!result) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}
		res.status(200).send(result);
	}),
);

router.delete(
	"/:id",
	asyncHandler(async (req, res) => {
		const result = await torRemove(req.params.id, res.locals.access);
		if (!result) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}
		res.status(200).send(result);
	}),
);

router.post(
	"/:id/start",
	asyncHandler(async (req, res) => {
		const result = await torStart(req.params.id, res.locals.access);
		if (!result) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}
		res.status(200).send(result);
	}),
);

router.post(
	"/:id/stop",
	asyncHandler(async (req, res) => {
		const result = await torStop(req.params.id, res.locals.access);
		if (!result) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}
		res.status(200).send(result);
	}),
);

export default router;
