import express from "express";
import apiValidator from "../lib/validator/api.js";
import internalAi from "../internal/ai.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router();

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.get("/config", jwtdecode(), async (req, res, next) => {
    try {
        const result = await internalAi.getConfig(res.locals.access);
        res.status(200).send(result);
    } catch (err) {
        next(err);
    }
});

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.put("/config", jwtdecode(), async (req, res, next) => {
    try {
        const payload = await apiValidator(getValidationSchema("/ai/config", "put"), req.body);
        const result = await internalAi.setConfig(res.locals.access, payload);
        res.status(200).send(result);
    } catch (err) {
        next(err);
    }
});

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.post("/models", jwtdecode(), async (req, res, next) => {
    try {
        console.log("DEBUG /models req.body:", JSON.stringify(req.body, null, 2));
        const payload = await apiValidator(getValidationSchema("/ai/models", "post"), req.body);
        console.log("DEBUG /models payload:", JSON.stringify(payload, null, 2));
        const result = await internalAi.getModels(res.locals.access, payload);
        res.status(200).send(result);
    } catch (err) {
        next(err);
    }
});

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.post("/chat", jwtdecode(), async (req, res, next) => {
    try {
        const payload = await apiValidator(getValidationSchema("/ai/chat", "post"), req.body);
        const { message, history } = payload;
        const result = await internalAi.chat(res.locals.access, message, history);
        res.status(200).send(result);
    } catch (err) {
        next(err);
    }
});

export default router;
