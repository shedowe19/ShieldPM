import express from "express";
import { transaction } from "objection";
import internalAuditLog from "../../internal/audit-log.js";
import internalTor from "../../internal/tor.js";
import { isDemoMode } from "../../lib/config.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import TorOnion from "../../models/tor_onion.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Middleware: JWT Decode & Demo Mode Block
 */
router.use(jwtdecode());

// Block all write operations in demo mode
router.use((req, res, next) => {
	if (isDemoMode() && req.method !== "GET") {
		res.status(403).send({ error: "Tor Onion Services are disabled in Demo Mode" });
		return;
	}
	next();
});

/**
 * GET /api/nginx/tor-onion
 */
router.get("/", async (_req, res, next) => {
	try {
		const accessData = await res.locals.access.can("tor_onions:list");
		const query = TorOnion.query().andWhere("is_deleted", 0).withGraphFetched("proxy_host").orderBy("name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.where("owner_user_id", res.locals.access.token.getUserId(1));
		}

		const services = await query;

		// Get Tor availability info
		const torInfo = await internalTor.getInfo();

		res.status(200).send({
			services,
			tor: torInfo,
		});
	} catch (err) {
		next(err);
	}
});

/**
 * GET /api/nginx/tor-onion/:id
 */
router.get("/:id", async (req, res, next) => {
	try {
		const accessData = await res.locals.access.can("tor_onions:get", req.params.id);
		const query = TorOnion.query()
			.andWhere("is_deleted", 0)
			.where("id", req.params.id)
			.withGraphFetched("proxy_host");

		if (accessData.permission_visibility !== "all") {
			query.where("owner_user_id", res.locals.access.token.getUserId(1));
		}

		const service = await query.first();

		if (!service) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}

		res.status(200).send(service);
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/nginx/tor-onion
 */
router.post("/", async (req, res, next) => {
	let trx;
	try {
		const payload = await apiValidator(getValidationSchema("/nginx/tor-onion", "post"), req.body);
		await res.locals.access.can("tor_onions:create", payload);
		payload.owner_user_id = res.locals.access.token.getUserId(1);
		payload.meta = {};
		payload.status = 0; // Initially stopped

		trx = await transaction.start(TorOnion.knex());
		const service = await TorOnion.query(trx).insert(payload);
		await trx.commit();

		// Refetch to get the full object
		const newService = await TorOnion.query().findById(service.id);

		// Create the onion service in Tor
		const result = await internalTor.create(newService);

		// Refetch with updated onion address
		const finalService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

		// Audit Log
		await internalAuditLog.add(res.locals.access, {
			action: "created",
			object_type: "tor-onion",
			object_id: finalService.id,
			meta: {
				name: finalService.name,
				onion_address: finalService.onionAddress,
			},
		});

		res.status(201).send({
			...finalService,
			created: result !== null,
		});
	} catch (err) {
		if (trx) {
			await trx.rollback();
		}
		next(err);
	}
});

/**
 * PUT /api/nginx/tor-onion/:id
 */
router.put("/:id", async (req, res, next) => {
	let trx;
	try {
		await res.locals.access.can("tor_onions:update", req.params.id);
		const service = await TorOnion.query()
			.where("owner_user_id", res.locals.access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", req.params.id)
			.first();

		if (!service) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}

		const payload = await apiValidator(getValidationSchema("/nginx/tor-onion/{id}", "put"), req.body);

		trx = await transaction.start(TorOnion.knex());
		const result = await service.$query(trx).patchAndFetch(payload);
		await trx.commit();

		// Restart the onion service if port configuration changed
		if (payload.virtual_port || payload.target_port) {
			await internalTor.restart(result);
		}

		// Refetch with updated data
		const updatedService = await TorOnion.query().findById(result.id).withGraphFetched("proxy_host");

		// Audit Log
		await internalAuditLog.add(res.locals.access, {
			action: "updated",
			object_type: "tor-onion",
			object_id: updatedService.id,
			meta: {
				name: updatedService.name,
				onion_address: updatedService.onionAddress,
			},
		});

		res.status(200).send(updatedService);
	} catch (err) {
		if (trx) {
			await trx.rollback();
		}
		next(err);
	}
});

/**
 * DELETE /api/nginx/tor-onion/:id
 */
router.delete("/:id", async (req, res, next) => {
	let trx;
	try {
		await res.locals.access.can("tor_onions:delete", req.params.id);
		const service = await TorOnion.query()
			.where("owner_user_id", res.locals.access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", req.params.id)
			.first();

		if (!service) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}

		// Stop the Tor onion service first
		await internalTor.stop(service);

		trx = await transaction.start(TorOnion.knex());
		await service.$query(trx).delete();
		await trx.commit();

		// Audit Log
		await internalAuditLog.add(res.locals.access, {
			action: "deleted",
			object_type: "tor-onion",
			object_id: service.id,
			meta: {
				name: service.name,
				onion_address: service.onionAddress,
			},
		});

		res.status(200).send({ status: "OK" });
	} catch (err) {
		if (trx) {
			await trx.rollback();
		}
		next(err);
	}
});

/**
 * POST /api/nginx/tor-onion/:id/start
 */
router.post("/:id/start", async (req, res, next) => {
	try {
		await res.locals.access.can("tor_onions:update", req.params.id);
		const service = await TorOnion.query()
			.where("owner_user_id", res.locals.access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", req.params.id)
			.first();

		if (!service) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}

		// If no private key yet, create the onion service
		if (!service.private_key) {
			await internalTor.create(service);
		} else {
			await internalTor.start(service);
		}

		// Refetch with updated status
		const updatedService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

		// Audit Log
		await internalAuditLog.add(res.locals.access, {
			action: "updated",
			object_type: "tor-onion",
			object_id: updatedService.id,
			meta: {
				name: updatedService.name,
				onion_address: updatedService.onionAddress,
				status: "started",
			},
		});

		res.status(200).send(updatedService);
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/nginx/tor-onion/:id/stop
 */
router.post("/:id/stop", async (req, res, next) => {
	try {
		await res.locals.access.can("tor_onions:update", req.params.id);
		const service = await TorOnion.query()
			.where("owner_user_id", res.locals.access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", req.params.id)
			.first();

		if (!service) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}

		await internalTor.stop(service);

		// Refetch with updated status
		const updatedService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

		// Audit Log
		await internalAuditLog.add(res.locals.access, {
			action: "updated",
			object_type: "tor-onion",
			object_id: updatedService.id,
			meta: {
				name: updatedService.name,
				onion_address: updatedService.onionAddress,
				status: "stopped",
			},
		});

		res.status(200).send(updatedService);
	} catch (err) {
		next(err);
	}
});

export default router;
