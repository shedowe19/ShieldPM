import express from "express";
import { transaction } from "objection";
import internalCloudflared from "../../internal/cloudflared.js";
import CloudflaredTunnel from "../../models/cloudflared_tunnel.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
    caseSensitive: true,
    strict: true,
    mergeParams: true,
});

/**
 * GET /api/nginx/cloudflared-tunnels
 */
router.use(jwtdecode());

router.get("/", async (req, res, next) => {
    try {
        const tunnels = await CloudflaredTunnel.query()
            .where("owner_user_id", res.locals.access.token.getUserId(1))
            .andWhere("is_deleted", 0)
            .orderBy("name", "ASC");
        res.status(200).send(tunnels);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/nginx/cloudflared-tunnels/:id
 */
router.get("/:id", async (req, res, next) => {
    try {
        const tunnel = await CloudflaredTunnel.query()
            .where("owner_user_id", res.locals.access.token.getUserId(1))
            .andWhere("is_deleted", 0)
            .where("id", req.params.id)
            .first();

        if (!tunnel) {
            res.status(404).send({ error: "Tunnel not found" });
            return;
        }

        res.status(200).send(tunnel);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/nginx/cloudflared-tunnels
 */
router.post("/", async (req, res, next) => {
    let trx;
    try {
        const payload = await apiValidator(getValidationSchema("/nginx/cloudflared-tunnels", "post"), req.body);
        payload.owner_user_id = res.locals.access.token.getUserId(1);
        payload.meta = {};

        trx = await transaction.start(CloudflaredTunnel.knex());
        const tunnel = await CloudflaredTunnel.query(trx).insert(payload);
        await trx.commit();

        // Refetch to get decrypted token for the process
        const newTunnel = await CloudflaredTunnel.query().findById(tunnel.id);

        // Start the process
        internalCloudflared.start(newTunnel);

        res.status(201).send(newTunnel);
    } catch (err) {
        if (trx) {
            await trx.rollback();
        }
        next(err);
    }
});

/**
 * PUT /api/nginx/cloudflared-tunnels/:id
 */
router.put("/:id", async (req, res, next) => {
    let trx;
    try {
        const tunnel = await CloudflaredTunnel.query()
            .where("owner_user_id", res.locals.access.token.getUserId(1)) // Ensure ownership
            .andWhere("is_deleted", 0)
            .where("id", req.params.id)
            .first();

        if (!tunnel) {
            res.status(404).send({ error: "Tunnel not found" });
            return;
        }

        const payload = await apiValidator(getValidationSchema("/nginx/cloudflared-tunnels/{id}", "put"), req.body);

        trx = await transaction.start(CloudflaredTunnel.knex());
        const result = await tunnel.$query(trx).patchAndFetch(payload);
        await trx.commit();

        // Restart with new config
        internalCloudflared.restart(result);

        res.status(200).send(result);
    } catch (err) {
        if (trx) {
            await trx.rollback();
        }
        next(err);
    }
});

/**
 * DELETE /api/nginx/cloudflared-tunnels/:id
 */
router.delete("/:id", async (req, res, next) => {
    let trx;
    try {
        const tunnel = await CloudflaredTunnel.query()
            .where("owner_user_id", res.locals.access.token.getUserId(1))
            .andWhere("is_deleted", 0)
            .where("id", req.params.id)
            .first();

        if (!tunnel) {
            res.status(404).send({ error: "Tunnel not found" });
            return;
        }

        // Stop process
        internalCloudflared.stop(tunnel.id);

        trx = await transaction.start(CloudflaredTunnel.knex());
        await tunnel.$query(trx).delete();
        await trx.commit();

        res.status(200).send({ status: "OK" });
    } catch (err) {
        if (trx) {
            await trx.rollback();
        }
        next(err);
    }
});

export default router;
