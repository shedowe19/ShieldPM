import TorOnion from "../../../models/tor_onion.js";
import internalTor from "../../tor.js";
import { isDemoMode } from "../../../lib/config.js";

const checkDemo = () => {
	if (isDemoMode()) throw new Error("Tor Onion Services are disabled in Demo Mode");
};

export const get_tor_onion_services = async (access, args) => {
	const services = await TorOnion.query().where("is_deleted", 0);
	return JSON.stringify(
		services.map((s) => ({
			id: s.id,
			name: s.name,
			onion: s.onion_address,
			status: s.status,
		})),
	);
};

export const create_tor_onion_service = async (access, args) => {
	checkDemo();
	const payload = {
		...args,
		owner_user_id: access.token.getUserId(1),
		status: 0,
	};
	const service = await TorOnion.query().insert(payload);
	await internalTor.create(service);
	const finalService = await TorOnion.query().findById(service.id);
	return `Created Tor Onion Service ID: ${service.id} (Address: ${finalService.onion_address})`;
};

export const update_tor_onion_service = async (access, args) => {
	checkDemo();
	const service = await TorOnion.query().findById(args.id);
	if (!service) throw new Error("Service not found");

	const updated = await service.$query().patchAndFetch(args);
	if (args.virtual_port || args.target_port) {
		await internalTor.restart(updated);
	}
	return `Updated Tor Onion Service ID: ${args.id}`;
};

export const delete_tor_onion_service = async (access, args) => {
	const service = await TorOnion.query().findById(args.id);
	if (service) {
		await internalTor.stop(service);
		await service.$query().patch({ is_deleted: 1 });
	}
	return `Deleted Tor Onion Service ID: ${args.id}`;
};

export const start_tor_onion_service = async (access, args) => {
	const service = await TorOnion.query().findById(args.id);
	if (service) {
		if (!service.private_key) await internalTor.create(service);
		else await internalTor.start(service);
	}
	return `Started Tor Onion Service ID: ${args.id}`;
};

export const stop_tor_onion_service = async (access, args) => {
	const service = await TorOnion.query().findById(args.id);
	if (service) await internalTor.stop(service);
	return `Stopped Tor Onion Service ID: ${args.id}`;
};
