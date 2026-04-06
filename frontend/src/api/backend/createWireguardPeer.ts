import * as api from "./base";
import type { WireguardPeer } from "./models";

export interface CreateWireguardPeerPayload {
	name: string;
	description?: string;
	allowed_ips?: string;
	persistent_keepalive?: number;
	dns?: string;
}

export async function createWireguardPeer(payload: CreateWireguardPeerPayload): Promise<WireguardPeer> {
	return await api.post({
		url: "/nginx/wireguard",
		data: payload,
	});
}
