import express from "express";
import { auditLogService } from "../../modules/audit-log/index.js";
import { cloudflaredService } from "../../modules/cloudflared/index.js";
import { auth, validate } from "../../lib/express/middleware.js";
import { asyncHandler } from "../../lib/express/route-handler.js";
import { global as logger } from "../../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router.use(auth());

/**
 * GET /api/nginx/cloudflared-tunnels
 */
router.get(
	"/",
	asyncHandler(async (_req, res) => {
		const tunnels = await cloudflaredService.list(res.locals.access);

		// Debug log
		for (const t of tunnels) {
			if (t.status === 3) {
				logger.info(`[API Debug] Tunnel ${t.id} (Status 3) Meta:`, JSON.stringify(t.meta));
			}
		}

		res.status(200).send(tunnels);
	}),
);

/**
 * GET /api/nginx/cloudflared-tunnels/:id
 */
router.get(
	"/:id",
	asyncHandler(async (req, res) => {
		const tunnel = await cloudflaredService.get(res.locals.access, req.params.id);

		if (!tunnel) {
			res.status(404).send({ error: "Tunnel not found" });
			return;
		}

		res.status(200).send(tunnel);
	}),
);

/**
 * POST /api/nginx/cloudflared-tunnels
 */
router.post(
	"/",
	asyncHandler(async (req, res) => {
		const payload = await validate("/nginx/cloudflared-tunnels", "post")(req.body);
		const newTunnel = await cloudflaredService.create(res.locals.access, payload);

		// Start the process
		cloudflaredService.start(newTunnel);

		// Audit Log
		await auditLogService.add(res.locals.access, {
			action: "created",
			object_type: "cloudflared-tunnel",
			object_id: newTunnel.id,
			meta: { name: newTunnel.name },
		});

		res.status(201).send(newTunnel);
	}),
);

/**
 * PUT /api/nginx/cloudflared-tunnels/:id
 */
router.put(
	"/:id",
	asyncHandler(async (req, res) => {
		const payload = await validate("/nginx/cloudflared-tunnels/{id}", "put")(req.body);
		const result = await cloudflaredService.update(res.locals.access, req.params.id, payload);

		if (!result) {
			res.status(404).send({ error: "Tunnel not found" });
			return;
		}

		// Restart with new config
		cloudflaredService.restart(result);

		// Audit Log
		await auditLogService.add(res.locals.access, {
			action: "updated",
			object_type: "cloudflared-tunnel",
			object_id: result.id,
			meta: { name: result.name },
		});

		res.status(200).send(result);
	}),
);

/**
 * DELETE /api/nginx/cloudflared-tunnels/:id
 */
router.delete(
	"/:id",
	asyncHandler(async (req, res) => {
		const tunnel = await cloudflaredService.remove(res.locals.access, req.params.id);

		if (!tunnel) {
			res.status(404).send({ error: "Tunnel not found" });
			return;
		}

		// Stop process
		cloudflaredService.stop(tunnel.id);

		// Audit Log
		await auditLogService.add(res.locals.access, {
			action: "deleted",
			object_type: "cloudflared-tunnel",
			object_id: tunnel.id,
			meta: { name: tunnel.name },
		});

		res.status(200).send({ status: "OK" });
	}),
);

export default router;
