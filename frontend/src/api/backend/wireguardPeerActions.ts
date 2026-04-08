import * as api from "./base";
import type { WireguardPeer } from "./models";

export async function enableWireguardPeer(id: number): Promise<WireguardPeer> {
	return await api.post({
		url: `/nginx/wireguard/${id}/enable`,
	});
}

export async function disableWireguardPeer(id: number): Promise<WireguardPeer> {
	return await api.post({
		url: `/nginx/wireguard/${id}/disable`,
	});
}
