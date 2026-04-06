import * as api from "./base";
import type { WireguardPeer } from "./models";

export interface UpdateWireguardPeerPayload {
	name?: string;
	description?: string;
	allowed_ips?: string;
	persistent_keepalive?: number;
	dns?: string;
}

export async function updateWireguardPeer(
	id: number,
	payload: UpdateWireguardPeerPayload,
): Promise<WireguardPeer> {
	return await api.put({
		url: `/nginx/wireguard/${id}`,
		data: payload,
	});
}
