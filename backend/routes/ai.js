import express from "express";
import validator from "../lib/validator/index.js";
import internalAi from "../internal/ai.js";
import jwtdecode from "../lib/express/jwt-decode.js";

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
router.put("/config", jwtdecode(), validator.validate, async (req, res, next) => {
    try {
        const result = await internalAi.setConfig(res.locals.access, req.body);
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
router.post("/models", jwtdecode(), validator.validate, async (req, res, next) => {
    try {
        const result = await internalAi.getModels(res.locals.access, req.body);
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
router.post("/chat", jwtdecode(), validator.validate, async (req, res, next) => {
    try {
        const { message, history } = req.body;
        const result = await internalAi.chat(res.locals.access, message, history);
        res.status(200).send(result);
    } catch (err) {
        next(err);
    }
});

export default router;
