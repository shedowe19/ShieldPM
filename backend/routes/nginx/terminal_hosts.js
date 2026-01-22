import express from "express";
import { transaction } from "objection";
import jwtdecode from "../../lib/express/jwt-decode.js";
import { encrypt } from "../../lib/encryption.js";
import apiValidator from "../../lib/validator/api.js";
import TerminalHost from "../../models/terminal_host.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
    caseSensitive: true,
    strict: true,
    mergeParams: true,
});

/**
 * GET /api/nginx/terminal-hosts
 */
router
    .route("/")
    .options((_, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode())
    .get(async (req, res, next) => {
        try {
            const query = TerminalHost.query().where("is_deleted", 0).orderBy("name", "ASC");

            // Filter by Owner
            if (req.query.owner_user_id) {
                query.where("owner_user_id", req.query.owner_user_id);
            }

            // Search
            if (req.query.query) {
                query.where((builder) => {
                    builder.where("name", "like", `%${req.query.query}%`).orWhere("host", "like", `%${req.query.query}%`);
                });
            }

            const hosts = await query;
            // Don't return secrets in list
            hosts.forEach((h) => {
                delete h.password;
                delete h.private_key;
            });

            res.status(200).send(hosts);
        } catch (err) {
            next(err);
        }
    })
    .post(async (req, res, next) => {
        let trx;
        try {
            trx = await transaction.start(TerminalHost.knex());

            const payload = await apiValidator(getValidationSchema("/nginx/terminal-hosts", "post"), req.body);

            // Encrypt sensitive data
            if (payload.password) {
                payload.password = encrypt(payload.password);
            }
            if (payload.private_key) {
                payload.private_key = encrypt(payload.private_key);
            }

            // Set owner
            payload.owner_user_id = res.locals.access.token.getUserId(1);

            const host = await TerminalHost.query(trx).insertAndFetch(payload);

            await trx.commit();
            res.status(201).send(host);
        } catch (err) {
            if (trx) {
                await trx.rollback();
            }
            next(err);
        }
    });

/**
 * GET /api/nginx/terminal-hosts/:id
 */
router
    .route("/:id")
    .options((_, res) => {
        res.sendStatus(204);
    })
    .all(jwtdecode())
    .get(async (req, res, next) => {
        try {
            const host = await TerminalHost.query()
                .where("is_deleted", 0)
                .where("id", req.params.id)
                .first()
                .throwIfNotFound();

            // Clear secrets for frontend view
            // Ideally we keep them but don't return the cleartext.
            // We only send back "********" or emptiness?
            // Let's just null them out.
            host.password = host.password ? "********" : null;
            host.private_key = host.private_key ? "********" : null;

            res.status(200).send(host);
        } catch (err) {
            next(err);
        }
    })
    .put(async (req, res, next) => {
        let trx;
        try {
            trx = await transaction.start(TerminalHost.knex());

            const host = await TerminalHost.query(trx)
                .where("is_deleted", 0)
                .where("id", req.params.id)
                .first()
                .throwIfNotFound();

            const payload = await apiValidator(getValidationSchema("/nginx/terminal-hosts/{id}", "put"), req.body);

            // Encrypt new secrets if provided
            if (payload.password && payload.password !== "********") {
                payload.password = encrypt(payload.password);
            } else if (payload.password === "********") {
                // Keep existing
                delete payload.password;
            }

            if (payload.private_key && payload.private_key !== "********") {
                payload.private_key = encrypt(payload.private_key);
            } else if (payload.private_key === "********") {
                delete payload.private_key;
            }

            await host.$query(trx).patchAndFetch(payload);

            await trx.commit();
            res.status(200).send(host);
        } catch (err) {
            if (trx) {
                await trx.rollback();
            }
            next(err);
        }
    })
    .delete(async (req, res, next) => {
        let trx;
        try {
            trx = await transaction.start(TerminalHost.knex());

            await TerminalHost.query(trx).where("id", req.params.id).patch({
                is_deleted: 1,
            });

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
