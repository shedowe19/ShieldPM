import express from "express";
import internalChat from "../internal/chat.js";
import { encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import ChatIntegrationModel from "../models/chat_integration.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router();

const publicIntegration = (integration) => {
	const output = typeof integration?.toJSON === "function" ? integration.toJSON() : { ...integration };
	delete output.token;
	return output;
};

const getActorId = (access) => {
	const actorId = access.token.getUserId(0);
	if (!Number.isInteger(actorId) || actorId < 1) throw new errs.PermissionError("Permission Denied");
	return actorId;
};

/**
 * GET /api/chat-integrations
 * List all chat integrations for the current user.
 */
router.get("/", jwtdecode(), async (_req, res) => {
	await res.locals.access.can("chat:list");
	const integrations = await ChatIntegrationModel.query().where("user_id", getActorId(res.locals.access));
	res.json(integrations.map(publicIntegration));
});

/**
 * POST /api/chat-integrations
 * Create a new integration
 */
router.post("/", jwtdecode(), async (req, res) => {
	const payload = await apiValidator(getValidationSchema("/chat", "post"), req.body);
	await res.locals.access.can("chat:create", payload);
	const actorId = getActorId(res.locals.access);

	if (payload.token) {
		payload.token = encrypt(payload.token);
	}

	const integration = await ChatIntegrationModel.query().insertAndFetch({
		...payload,
		user_id: actorId,
		meta: payload.meta || {},
		config: payload.config || { allowed_ids: [] },
	});

	await internalChat.startBot(integration);
	res.json(publicIntegration(integration));
});

/**
 * PUT /api/chat-integrations/:id
 * Update
 */
router.put("/:id", jwtdecode(), async (req, res) => {
	const actorId = getActorId(res.locals.access);
	const integration = await ChatIntegrationModel.query().where("user_id", actorId).findById(req.params.id);
	if (!integration) throw new errs.ItemNotFoundError();

	await res.locals.access.can("chat:update", req.params.id);
	const payload = await apiValidator(getValidationSchema("/chat/{integrationID}", "put"), req.body);
	payload.id = Number.parseInt(req.params.id, 10);

	if (payload.token) {
		payload.token = encrypt(payload.token);
	}

	const updated = await ChatIntegrationModel.query()
		.where("user_id", actorId)
		.patchAndFetchById(req.params.id, {
			...payload,
			modified_on: new Date().toISOString(),
		});
	if (!updated) throw new errs.ItemNotFoundError();

	await internalChat.reload(updated.id);
	res.json(publicIntegration(updated));
});

/**
 * DELETE /api/chat-integrations/:id
 */
router.delete("/:id", jwtdecode(), async (req, res) => {
	const actorId = getActorId(res.locals.access);
	const integration = await ChatIntegrationModel.query().where("user_id", actorId).findById(req.params.id);
	if (!integration) throw new errs.ItemNotFoundError();

	await res.locals.access.can("chat:delete", req.params.id);

	const deleted = await ChatIntegrationModel.query()
		.where("user_id", actorId)
		.deleteById(Number.parseInt(req.params.id, 10));
	if (deleted !== 1) throw new errs.ItemNotFoundError();
	await internalChat.stopBot(integration.id);

	res.json({ status: "ok" });
});

export default router;
