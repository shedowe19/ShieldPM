import * as api from "./base";

export async function getWireguardPeerConfig(id: number): Promise<{ config: string }> {
	return await api.get({
		url: `/nginx/wireguard/${id}/config`,
	});
}
