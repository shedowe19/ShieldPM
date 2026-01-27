import express from "express";
import internalChat from "../internal/chat.js";
import { encrypt } from "../lib/encryption.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import ChatIntegrationModel from "../models/chat_integration.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router();

/**
 * GET /api/chat-integrations
 * List all chat integrations for the current user (or all if admin?)
 * For now, let's limit to user's own integrations or admin view.
 */
router.get("/", jwtdecode(), async (_req, res, next) => {
	try {
		// Use 'settings:list' or 'users:list' as proxy for admin?
		// Or creating a new permission 'chat:list'?
		// Let's stick to standard RBAC: user sees own, admin sees all.
		// NOTE: access.js logic needed to enforce this properly.
		// For MVP: Return all if admin, specific if user.

		const integrations = await ChatIntegrationModel.query()
			.where("user_id", res.locals.access.token.getUserId())
			.orWhere(() => {
				// If admin, show all? TODO: Add proper Admin check
				// For now simpler: Users manage THEIR OWN bots.
			});

		res.json(integrations);
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/chat-integrations
 * Create a new integration
 */
router.post("/", jwtdecode(), async (req, res, next) => {
	try {
		// Reusing settings permission or create new?
		// Let's assume if you can login, you can create a bot for yourself.

		// Validation Schema
		const payload = await apiValidator(getValidationSchema("/chat", "post"), req.body);

		if (payload.token) {
			payload.token = encrypt(payload.token);
		}

		const integration = await ChatIntegrationModel.query().insertAndFetch({
			...payload,
			user_id: res.locals.access.token.getUserId(),
			meta: payload.meta || {},
			config: payload.config || { allowed_ids: [] },
		});

		// Start the bot immediately
		await internalChat.startBot(integration);

		res.json(integration);
	} catch (err) {
		next(err);
	}
});

/**
 * PUT /api/chat-integrations/:id
 * Update
 */
router.put("/:id", jwtdecode(), async (req, res, next) => {
	try {
		const integration = await ChatIntegrationModel.query().findById(req.params.id);
		if (!integration) throw new Error("Not Found");

		if (integration.user_id !== res.locals.access.token.getUserId()) {
			// Check generic admin permission if not owner
			await res.locals.access.can("settings:update", "chat");
		}

		const payload = await apiValidator(getValidationSchema("/chat/{integrationID}", "put"), req.body);
		payload.id = parseInt(req.params.id, 10);

		if (payload.token) {
			payload.token = encrypt(payload.token);
		}

		const updated = await ChatIntegrationModel.query().patchAndFetchById(req.params.id, {
			...payload,
			modified_on: new Date().toISOString(),
		});

		await internalChat.reload(updated.id);
		res.json(updated);
	} catch (err) {
		next(err);
	}
});

/**
 * DELETE /api/chat-integrations/:id
 */
router.delete("/:id", jwtdecode(), async (req, res, next) => {
	try {
		const integration = await ChatIntegrationModel.query().findById(req.params.id);
		if (!integration) throw new Error("Not Found");

		if (integration.user_id !== res.locals.access.token.getUserId()) {
			await res.locals.access.can("settings:update", "chat");
		}

		await internalChat.stopBot(integration.id);
		await ChatIntegrationModel.query().deleteById(parseInt(req.params.id, 10));

		res.json({ status: "ok" });
	} catch (err) {
		next(err);
	}
});

export default router;
