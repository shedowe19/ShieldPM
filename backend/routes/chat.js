import express from "express";
import { chatService } from "../modules/chat/index.js";
import errs from "../lib/error.js";
import { encrypt } from "../lib/encryption.js";
import { auth, validate } from "../lib/express/middleware.js";
import { asyncHandler } from "../lib/express/route-handler.js";

const router = express.Router();

/**
 * GET /api/chat-integrations
 * List all chat integrations for the current user.
 */
router.get(
	"/",
	auth(),
	asyncHandler(async (_req, res) => {
		const integrations = await ChatIntegrationModel.query().where("user_id", res.locals.access.token.getUserId());
		res.json(integrations);
	}),
);

/**
 * POST /api/chat-integrations
 * Create a new integration
 */
router.post(
	"/",
	auth(),
	asyncHandler(async (req, res) => {
		const payload = await validate("/chat", "post")(req.body);

		if (payload.token) {
			payload.token = encrypt(payload.token);
		}

		const integration = await ChatIntegrationModel.query().insertAndFetch({
			...payload,
			user_id: res.locals.access.token.getUserId(),
			meta: payload.meta || {},
			config: payload.config || { allowed_ids: [] },
		});

		await chatService.startBot(integration);
		res.json(integration);
	}),
);

/**
 * PUT /api/chat-integrations/:id
 * Update
 */
router.put(
	"/:id",
	auth(),
	asyncHandler(async (req, res) => {
		const integration = await ChatIntegrationModel.query().findById(req.params.id);
		if (!integration) throw new errs.ItemNotFoundError();

		if (integration.user_id !== res.locals.access.token.getUserId()) {
			await res.locals.access.can("settings:update", "chat");
		}

		const payload = await validate("/chat/{integrationID}", "put")(req.body);
		payload.id = Number.parseInt(req.params.id, 10);

		if (payload.token) {
			payload.token = encrypt(payload.token);
		}

		const updated = await ChatIntegrationModel.query().patchAndFetchById(req.params.id, {
			...payload,
			modified_on: new Date().toISOString(),
		});

		await chatService.reload(updated.id);
		res.json(updated);
	}),
);

/**
 * DELETE /api/chat-integrations/:id
 */
router.delete(
	"/:id",
	auth(),
	asyncHandler(async (req, res) => {
		const integration = await ChatIntegrationModel.query().findById(req.params.id);
		if (!integration) throw new errs.ItemNotFoundError();

		if (integration.user_id !== res.locals.access.token.getUserId()) {
			await res.locals.access.can("settings:update", "chat");
		}

		await chatService.stopBot(integration.id);
		await ChatIntegrationModel.query().deleteById(Number.parseInt(req.params.id, 10));

		res.json({ status: "ok" });
	}),
);

export default router;
