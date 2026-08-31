import express from "express";
import internalAi from "../internal/ai.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import { express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router();

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.get("/config", jwtdecode(), async (_req, res) => {
	const result = await internalAi.getConfig(res.locals.access);
	res.status(200).json(result);
});

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.put("/config", jwtdecode(), async (req, res) => {
	const payload = await apiValidator(getValidationSchema("/ai/config", "put"), req.body);
	const result = await internalAi.setConfig(res.locals.access, payload);
	res.status(200).json(result);
});

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.post("/models", jwtdecode(), async (req, res) => {
	const payload = await apiValidator(getValidationSchema("/ai/models", "post"), req.body);
	const result = await internalAi.getModels(res.locals.access, payload);
	res.status(200).json(result);
});

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.post("/chat", jwtdecode(), async (req, res) => {
	logger.debug("AI Chat request received:", {
		messageLength: typeof req.body.message === "string" ? req.body.message.length : 0,
		historyLength: req.body.history?.length || 0,
	});
	const payload = await apiValidator(getValidationSchema("/ai/chat", "post"), req.body);
	const { message, history } = payload;
	const result = await internalAi.chat(res.locals.access, message, history);
	logger.debug("AI Chat response:", {
		contentLength: result.content.length,
		confirmationRequired: Boolean(result.confirmation),
	});
	res.status(200).json(result);
});

router.post("/confirm", jwtdecode(), async (req, res) => {
	const payload = await apiValidator(getValidationSchema("/ai/confirm", "post"), req.body);
	const result = await internalAi.confirm(res.locals.access, payload.confirmation_token);
	logger.info("AI action executed after explicit authenticated confirmation");
	res.status(200).json(result);
});

export default router;
