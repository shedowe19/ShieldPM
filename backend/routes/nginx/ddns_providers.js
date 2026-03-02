import express from "express";
import internalDdnsProvider from "../../internal/ddns-provider.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import { debug, express as logger } from "../../logger.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/nginx/ddns-providers
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/ddns-providers
	 */
	.get(async (req, res, next) => {
		try {
			await res.locals.access.can("ddns_providers:list");
			const rows = await internalDdnsProvider.getAll(res.locals.access);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * POST /api/nginx/ddns-providers
	 */
	.post(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/nginx/ddns-providers", "post"), req.body);
			await res.locals.access.can("ddns_providers:create", payload);
			const result = await internalDdnsProvider.create(res.locals.access, payload);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/nginx/ddns-providers/:id
 */
router
	.route("/:id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/ddns-providers/:id
	 */
	.get(async (req, res, next) => {
		try {
			await res.locals.access.can("ddns_providers:get", req.params.id);
			const result = await internalDdnsProvider.get(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/nginx/ddns-providers/:id
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(
				getValidationSchema("/nginx/ddns-providers/providerID", "put"),
				req.body,
			);
			await res.locals.access.can("ddns_providers:update", req.params.id);
			payload.id = Number.parseInt(req.params.id, 10);
			const result = await internalDdnsProvider.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * DELETE /api/nginx/ddns-providers/:id
	 */
	.delete(async (req, res, next) => {
		try {
			await res.locals.access.can("ddns_providers:delete", req.params.id);
			const result = await internalDdnsProvider.delete(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/nginx/ddns-providers/:id/test
 */
router
	.route("/:id/test")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("ddns_providers:update", req.params.id);
			const result = await internalDdnsProvider.test(res.locals.access, {
				id: Number.parseInt(req.params.id, 10),
			});
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
