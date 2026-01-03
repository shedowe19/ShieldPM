import express from "express";
import validator from "../lib/validator/index.js";
import internalAi from "../internal/ai.js";
import { jwtAuth } from "../lib/auth.js";

const router = express.Router();

/**
 * @param {express.Request} res
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
router.get("/config", jwtAuth, async (req, res, next) => {
    try {
        const result = await internalAi.getConfig(req.res.locals.access);
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
router.put("/config", jwtAuth, validator.validate, async (req, res, next) => {
    try {
        // Validated body is in req.params? No, validator middleware puts it in req.body usually, 
        // but check existing implementation. Ah, validator.validate uses schema found by route path.
        // It validates req.body against schema.
        const result = await internalAi.setConfig(req.res.locals.access, req.body);
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
router.post("/models", jwtAuth, validator.validate, async (req, res, next) => {
    try {
        const result = await internalAi.getModels(req.res.locals.access, req.body);
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
router.post("/chat", jwtAuth, validator.validate, async (req, res, next) => {
    try {
        const { message, history } = req.body;
        const response = await internalAi.chat(req.res.locals.access, message, history);
        res.status(200).send(response);
    } catch (err) {
        next(err);
    }
});

export default router;
