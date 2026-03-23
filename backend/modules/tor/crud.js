import { transaction } from "objection";
import { auditLogService } from "../audit-log/index.js";
import TorOnion from "../../models/tor_onion.js";
import torService from "./service.js";

const baseQuery = () => TorOnion.query().where("is_deleted", 0);

const ownerFilter = (query, access) => {
	if (access.permission_visibility !== "all") {
		query.where("owner_user_id", access.token.getUserId(1));
	}
	return query;
};

export async function list(access) {
	const accessData = await access.can("tor_onions:list");
	const query = baseQuery().withGraphFetched("proxy_host").orderBy("name", "ASC");
	ownerFilter(query, accessData);
	const services = await query;
	const torInfo = await torService.getInfo?.() || {};
	return { services, tor: torInfo };
}

export async function get(id, access) {
	const accessData = await access.can("tor_onions:get", id);
	const query = baseQuery().where("id", id).withGraphFetched("proxy_host");
	ownerFilter(query, accessData);
	return query.first();
}

export async function create(payload, access) {
	await access.can("tor_onions:create", payload);
	payload.owner_user_id = access.token.getUserId(1);
	payload.meta = {};
	payload.status = 0;

	const trx = await transaction.start(TorOnion.knex());
	try {
		const service = await TorOnion.query(trx).insert(payload);
		await trx.commit();

		await torService.create?.(service) || torService.regenerateTorConfig?.();
		const finalService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

		await auditLogService.add(access, {
			action: "created",
			object_type: "tor-onion",
			object_id: finalService.id,
			meta: { name: finalService.name, onion_address: finalService.onionAddress },
		});

		return finalService;
	} catch (err) {
		await trx.rollback();
		throw err;
	}
}

export async function update(id, body, access) {
	await access.can("tor_onions:update", id);
	const service = await baseQuery()
		.where("owner_user_id", access.token.getUserId(1))
		.where("id", id)
		.first();

	if (!service) return null;

	const trx = await transaction.start(TorOnion.knex());
	try {
		const result = await service.$query(trx).patchAndFetch(body);
		await trx.commit();

		if (body.virtual_port || body.target_port) {
			await torService.restart?.(result);
		}

		const updatedService = await TorOnion.query().findById(result.id).withGraphFetched("proxy_host");

		await auditLogService.add(access, {
			action: "updated",
			object_type: "tor-onion",
			object_id: updatedService.id,
			meta: { name: updatedService.name, onion_address: updatedService.onionAddress },
		});

		return updatedService;
	} catch (err) {
		await trx.rollback();
		throw err;
	}
}

export async function remove(id, access) {
	await access.can("tor_onions:delete", id);
	const service = await baseQuery()
		.where("owner_user_id", access.token.getUserId(1))
		.where("id", id)
		.first();

	if (!service) return null;

	await torService.stop?.(service);

	const trx = await transaction.start(TorOnion.knex());
	try {
		await service.$query(trx).delete();
		await trx.commit();

		await auditLogService.add(access, {
			action: "deleted",
			object_type: "tor-onion",
			object_id: service.id,
			meta: { name: service.name, onion_address: service.onionAddress },
		});

		return { status: "OK" };
	} catch (err) {
		await trx.rollback();
		throw err;
	}
}

export async function startOnion(id, access) {
	await access.can("tor_onions:update", id);
	const service = await baseQuery()
		.where("owner_user_id", access.token.getUserId(1))
		.where("id", id)
		.first();

	if (!service) return null;

	if (!service.private_key) {
		await torService.create?.(service) || torService.regenerateTorConfig?.();
	} else {
		await torService.start?.(service);
	}

	const updatedService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

	await auditLogService.add(access, {
		action: "updated",
		object_type: "tor-onion",
		object_id: updatedService.id,
		meta: { name: updatedService.name, onion_address: updatedService.onionAddress, status: "started" },
	});

	return updatedService;
}

export async function stopOnion(id, access) {
	await access.can("tor_onions:update", id);
	const service = await baseQuery()
		.where("owner_user_id", access.token.getUserId(1))
		.where("id", id)
		.first();

	if (!service) return null;

	await torService.stop?.(service);

	const updatedService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

	await auditLogService.add(access, {
		action: "updated",
		object_type: "tor-onion",
		object_id: updatedService.id,
		meta: { name: updatedService.name, onion_address: updatedService.onionAddress, status: "stopped" },
	});

	return updatedService;
}
