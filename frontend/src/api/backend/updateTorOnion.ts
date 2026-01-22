import * as api from "./base";
import type { TorOnion } from "./models";

export interface UpdateTorOnionPayload {
	name?: string;
	proxyHostId?: number;
	virtualPort?: number;
	targetPort?: number;
}

export async function updateTorOnion(id: number, payload: UpdateTorOnionPayload): Promise<TorOnion> {
	const data: Record<string, unknown> = {};
	if (payload.name) data.name = payload.name;
	if (payload.proxyHostId !== undefined) data.proxy_host_id = payload.proxyHostId;
	if (payload.virtualPort !== undefined) data.virtual_port = payload.virtualPort;
	if (payload.targetPort !== undefined) data.target_port = payload.targetPort;

	return await api.put({
		url: `/nginx/tor-onion/${id}`,
		data,
	});
}
