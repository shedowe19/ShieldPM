import express from "express";
import { gitDeployService } from "../../modules/git-deploy/index.js";
import { proxyHostService } from "../../modules/proxy-host/index.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import validator from "../../lib/validator/index.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/nginx/proxy-hosts
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/proxy-hosts
	 *
	 * Retrieve all proxy-hosts
	 */
	.get(async (req, res) => {
		const data = await validator(
			{
				additionalProperties: false,
				properties: {
					expand: {
						$ref: "common#/properties/expand",
					},
					query: {
						$ref: "common#/properties/query",
					},
				},
			},
			{
				expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
				query: typeof req.query.query === "string" ? req.query.query : null,
			},
		);
		const rows = await proxyHostService.getAll(res.locals.access, data.expand, data.query);
		res.status(200).send(rows);
	})

	/**
	 * POST /api/nginx/proxy-hosts
	 *
	 * Create a new proxy-host
	 */
	.post(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/proxy-hosts", "post"), req.body);
		const result = await proxyHostService.create(res.locals.access, payload);
		res.status(201).send(result);
	});

/**
 * Specific proxy-host
 *
 * /api/nginx/proxy-hosts/123
 */
router
	.route("/:host_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/proxy-hosts/123
	 *
	 * Retrieve a specific proxy-host
	 */
	.get(async (req, res) => {
		const data = await validator(
			{
				required: ["host_id"],
				additionalProperties: false,
				properties: {
					host_id: {
						$ref: "common#/properties/id",
					},
					expand: {
						$ref: "common#/properties/expand",
					},
				},
			},
			{
				host_id: req.params.host_id,
				expand: typeof req.query.expand === "string" ? req.query.expand.split(",") : null,
			},
		);
		const row = await proxyHostService.get(res.locals.access, {
			id: Number.parseInt(data.host_id, 10),
			expand: data.expand,
		});
		res.status(200).send(row);
	})

	/**
	 * PUT /api/nginx/proxy-hosts/123
	 *
	 * Update and existing proxy-host
	 */
	.put(async (req, res) => {
		const payload = await apiValidator(getValidationSchema("/nginx/proxy-hosts/{hostID}", "put"), req.body);
		payload.id = Number.parseInt(req.params.host_id, 10);
		const result = await proxyHostService.update(res.locals.access, payload);
		res.status(200).send(result);
	})

	/**
	 * DELETE /api/nginx/proxy-hosts/123
	 *
	 * Update and existing proxy-host
	 */
	.delete(async (req, res) => {
		const result = await proxyHostService.delete(res.locals.access, {
			id: Number.parseInt(req.params.host_id, 10),
		});
		res.status(200).send(result);
	});

/**
 * Enable proxy-host
 *
 * /api/nginx/proxy-hosts/123/enable
 */
router
	.route("/:host_id/enable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/proxy-hosts/123/enable
	 */
	.post(async (req, res) => {
		const result = await proxyHostService.enable(res.locals.access, {
			id: Number.parseInt(req.params.host_id, 10),
		});
		res.status(200).send(result);
	});

/**
 * Disable proxy-host
 *
 * /api/nginx/proxy-hosts/123/disable
 */
router
	.route("/:host_id/disable")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/proxy-hosts/123/disable
	 */
	.post(async (req, res) => {
		const result = await proxyHostService.disable(res.locals.access, {
			id: Number.parseInt(req.params.host_id, 10),
		});
		res.status(200).send(result);
	});

/**
 * Git Sync - Trigger manual sync
 *
 * /api/nginx/proxy-hosts/123/git-sync
 */
router
	.route("/:host_id/git-sync")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/nginx/proxy-hosts/123/git-sync
	 *
	 * Trigger a manual Git sync for a path-based proxy host
	 */
	.post(async (req, res) => {
		const hostId = Number.parseInt(req.params.host_id, 10);
		await res.locals.access.can("proxy_hosts:update", hostId);
		await apiValidator(getValidationSchema("/nginx/proxy-hosts/{hostID}/git-sync", "post"), req.body);
		const result = await gitDeployService.sync(res.locals.access, hostId);
		res.status(200).send(result);
	});

/**
 * Git Status - Get sync status
 *
 * /api/nginx/proxy-hosts/123/git-status
 */
router
	.route("/:host_id/git-status")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/nginx/proxy-hosts/123/git-status
	 *
	 * Get Git sync status for a proxy host
	 */
	.get(async (req, res) => {
		const hostId = Number.parseInt(req.params.host_id, 10);
		await res.locals.access.can("proxy_hosts:get", hostId);
		const result = await gitDeployService.getStatus(res.locals.access, hostId);
		res.status(200).send(result);
	})

	/**
	 * PUT /api/nginx/proxy-hosts/123/git-status
	 *
	 * Update Git sync configuration for a proxy host
	 */
	.put(async (req, res) => {
		const hostId = Number.parseInt(req.params.host_id, 10);
		const payload = await apiValidator(
			getValidationSchema("/nginx/proxy-hosts/{hostID}/git-status", "put"),
			req.body,
		);
		const result = await gitDeployService.updateConfig(res.locals.access, hostId, payload);
		res.status(200).send(result);
	});

export default router;
