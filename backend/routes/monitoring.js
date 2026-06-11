import express from "express";
import internalMonitoring from "../internal/monitoring.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res) => {
		await res.locals.access.can("monitoring:list");
		const rows = await internalMonitoring.getAll(res.locals.access);
		res.status(200).send(rows);
	})
	.post(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/monitoring", "post"), req.body);
		await res.locals.access.can("monitoring:create", payload);
		const row = await internalMonitoring.create(res.locals.access, payload);
		res.status(201).send(row);
	});

router
	.route("/from-proxy-host/:proxy_host_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res) => {
		await res.locals.access.can("monitoring:create", { proxy_host_id: req.params.proxy_host_id });
		const row = await internalMonitoring.createFromProxyHost(
			res.locals.access,
			Number.parseInt(req.params.proxy_host_id, 10),
		);
		res.status(201).send(row);
	});

router
	.route("/:id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res) => {
		await res.locals.access.can("monitoring:get", req.params.id);
		const row = await internalMonitoring.get(res.locals.access, { id: Number.parseInt(req.params.id, 10) });
		res.status(200).send(row);
	})
	.put(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/monitoring/{id}", "put"), req.body);
		await res.locals.access.can("monitoring:update", req.params.id);
		payload.id = Number.parseInt(req.params.id, 10);
		const row = await internalMonitoring.update(res.locals.access, payload);
		res.status(200).send(row);
	})
	.delete(async (req, res) => {
		await res.locals.access.can("monitoring:delete", req.params.id);
		const result = await internalMonitoring.delete(res.locals.access, { id: Number.parseInt(req.params.id, 10) });
		res.status(200).send(result);
	});

router
	.route("/:id/checks")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res) => {
		await res.locals.access.can("monitoring:get", req.params.id);
		const rows = await internalMonitoring.getChecks(res.locals.access, {
			id: Number.parseInt(req.params.id, 10),
			limit: Number.parseInt(req.query.limit || "250", 10),
		});
		res.status(200).send(rows);
	});

router
	.route("/:id/test")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res) => {
		await res.locals.access.can("monitoring:update", req.params.id);
		const result = await internalMonitoring.test(res.locals.access, { id: Number.parseInt(req.params.id, 10) });
		res.status(200).send(result);
	});

export default router;
