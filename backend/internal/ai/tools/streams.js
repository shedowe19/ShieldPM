import internalStream from "../../stream.js";

export const get_streams = async (access, args) => {
	const streams = await internalStream.getAll(access);
	return JSON.stringify(
		streams.map((s) => ({
			id: s.id,
			incoming_port: s.incoming_port,
			forwarding_host: s.forwarding_host,
			forwarding_port: s.forwarding_port,
			tcp_forwarding: s.tcp_forwarding,
			udp: s.udp_forwarding,
			enabled: s.enabled,
		})),
	);
};

export const create_stream = async (access, args) => {
	const newStream = await internalStream.create(access, {
		certificate_id: 0,
		meta: {},
		...args,
	});
	return `Created Stream ID: ${newStream.id}`;
};

export const update_stream = async (access, args) => {
	await internalStream.update(access, { id: args.id, ...args });
	return `Updated Stream ID: ${args.id}`;
};

export const delete_stream = async (access, args) => {
	await internalStream.delete(access, { id: args.id });
	// Auto-verify
	const remainingStreams = await internalStream.getAll(access);
	const stillExistsStream = remainingStreams.some((s) => s.id === args.id);
	if (stillExistsStream) {
		return `ERROR: Delete failed! Stream ID ${args.id} still exists!`;
	}
	return `Deleted and VERIFIED: Stream ID ${args.id} no longer exists.`;
};

export const enable_stream = async (access, args) => {
	await internalStream.enable(access, { id: args.id });
	return `Enabled Stream ID: ${args.id}`;
};

export const disable_stream = async (access, args) => {
	await internalStream.disable(access, { id: args.id });
	return `Disabled Stream ID: ${args.id}`;
};
