import express from "express";
import { aiService } from "../modules/ai/index.js";
import { auth, validate } from "../lib/express/middleware.js";
import { asyncHandler } from "../lib/express/route-handler.js";
import { express as logger } from "../logger.js";

const router = express.Router();

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.get(
	"/config",
	auth(),
	asyncHandler(async (_req, res) => {
		const result = await aiService.getConfig(res.locals.access);
		res.status(200).json(result);
	}),
);

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.put(
	"/config",
	auth(),
	asyncHandler(async (req, res) => {
		const payload = await validate("/ai/config", "put")(req.body);
		const result = await aiService.setConfig(res.locals.access, payload);
		res.status(200).json(result);
	}),
);

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.post(
	"/models",
	auth(),
	asyncHandler(async (req, res) => {
		const payload = await validate("/ai/models", "post")(req.body);
		const result = await aiService.getModels(res.locals.access, payload);
		res.status(200).json(result);
	}),
);

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.post(
	"/chat",
	auth(),
	asyncHandler(async (req, res) => {
		logger.debug("AI Chat request received:", {
			message: req.body.message,
			historyLength: req.body.history?.length || 0,
		});
		const payload = await validate("/ai/chat", "post")(req.body);
		const { message, history } = payload;
		const result = await aiService.chat(res.locals.access, message, history);
		logger.debug("AI Chat response:", result);
		res.status(200).json(result);
	}),
);

export default router;
