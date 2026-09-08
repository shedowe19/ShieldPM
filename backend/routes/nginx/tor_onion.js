import express from "express";
import { transaction } from "objection";
import internalAuditLog from "../../internal/audit-log.js";
import internalTor from "../../internal/tor.js";
import { isDemoMode } from "../../lib/config.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import ProxyHost from "../../models/proxy_host.js";
import TorOnion from "../../models/tor_onion.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// Public management responses never need the key used to recreate an onion identity.
const publicService = (service) => {
	const { private_key, ...result } = service.toJSON();
	return result;
};

// Linking an onion service changes the target host's domains, so host update access is required.
const assertProxyHostAccess = async (access, hostId) => {
	if (!hostId) return;
	const accessData = await access.can("proxy_hosts:update", hostId);
	const query = ProxyHost.query().where("id", hostId).where("is_deleted", 0);
	if (accessData.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
	if (!(await query.first())) throw new errs.ItemNotFoundError(hostId);
};

const getMutableService = async (access, id, operation) => {
	const accessData = await access.can(`tor_onions:${operation}`, id);
	const query = TorOnion.query().where("is_deleted", 0).where("id", id);
	if (accessData.permission_visibility !== "all") query.where("owner_user_id", access.token.getUserId(1));
	return query.first();
};

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
router.get("/", async (_req, res) => {
	const accessData = await res.locals.access.can("tor_onions:list");
	const query = TorOnion.query().andWhere("is_deleted", 0).withGraphFetched("proxy_host").orderBy("name", "ASC");

	if (accessData.permission_visibility !== "all") {
		query.where("owner_user_id", res.locals.access.token.getUserId(1));
	}

	const services = await query;

	// Get Tor availability info
	const torInfo = await internalTor.getInfo();

	res.status(200).send({
		services: services.map(publicService),
		tor: torInfo,
	});
});

/**
 * GET /api/nginx/tor-onion/:id
 */
router.get("/:id", async (req, res) => {
	const accessData = await res.locals.access.can("tor_onions:get", req.params.id);
	const query = TorOnion.query().andWhere("is_deleted", 0).where("id", req.params.id).withGraphFetched("proxy_host");

	if (accessData.permission_visibility !== "all") {
		query.where("owner_user_id", res.locals.access.token.getUserId(1));
	}

	const service = await query.first();

	if (!service) {
		res.status(404).send({ error: "Onion Service not found" });
		return;
	}

	res.status(200).send(publicService(service));
});

/**
 * POST /api/nginx/tor-onion
 */
router.post("/", async (req, res, next) => {
	let trx;
	try {
		const payload = await apiValidator(getValidationSchema("/nginx/tor-onion", "post"), req.body);
		await res.locals.access.can("tor_onions:create", payload);
		await assertProxyHostAccess(res.locals.access, payload.proxy_host_id);
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
				onion_address: finalService.onion_address,
			},
		});

		res.status(201).send({
			...publicService(finalService),
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
	try {
		const service = await getMutableService(res.locals.access, req.params.id, "update");

		if (!service) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}

		const payload = await apiValidator(getValidationSchema("/nginx/tor-onion/{id}", "put"), req.body);
		const result = await internalTor.update(res.locals.access, service, payload);

		// Restart the onion service if port configuration changed
		if (payload.virtual_port || payload.target_port) {
			if (!(await internalTor.restart(result))) throw new errs.ValidationError("Unable to restart onion service");
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
				onion_address: updatedService.onion_address,
			},
		});

		res.status(200).send(publicService(updatedService));
	} catch (err) {
		next(err);
	}
});

/**
 * DELETE /api/nginx/tor-onion/:id
 */
router.delete("/:id", async (req, res, next) => {
	let trx;
	try {
		const service = await getMutableService(res.locals.access, req.params.id, "delete");

		if (!service) {
			res.status(404).send({ error: "Onion Service not found" });
			return;
		}

		// Stop the Tor onion service first
		if (!(await internalTor.stop(service))) throw new errs.ValidationError("Unable to stop onion service");

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
				onion_address: service.onion_address,
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
router.post("/:id/start", async (req, res) => {
	const service = await getMutableService(res.locals.access, req.params.id, "update");

	if (!service) {
		res.status(404).send({ error: "Onion Service not found" });
		return;
	}

	await assertProxyHostAccess(res.locals.access, service.proxy_host_id);

	// If no private key yet, create the onion service
	const started = !service.private_key ? await internalTor.create(service) : await internalTor.start(service);
	if (!started) throw new errs.ValidationError("Unable to start onion service");

	// Refetch with updated status
	const updatedService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

	// Audit Log
	await internalAuditLog.add(res.locals.access, {
		action: "updated",
		object_type: "tor-onion",
		object_id: updatedService.id,
		meta: {
			name: updatedService.name,
			onion_address: updatedService.onion_address,
			status: "started",
		},
	});

	res.status(200).send(publicService(updatedService));
});

/**
 * POST /api/nginx/tor-onion/:id/stop
 */
router.post("/:id/stop", async (req, res) => {
	const service = await getMutableService(res.locals.access, req.params.id, "update");

	if (!service) {
		res.status(404).send({ error: "Onion Service not found" });
		return;
	}

	if (!(await internalTor.stop(service))) throw new errs.ValidationError("Unable to stop onion service");

	// Refetch with updated status
	const updatedService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

	// Audit Log
	await internalAuditLog.add(res.locals.access, {
		action: "updated",
		object_type: "tor-onion",
		object_id: updatedService.id,
		meta: {
			name: updatedService.name,
			onion_address: updatedService.onion_address,
			status: "stopped",
		},
	});

	res.status(200).send(publicService(updatedService));
});

export default router;
