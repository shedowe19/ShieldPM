import * as api from "./base";
import type { WireguardListResponse } from "./models";

export async function getWireguardPeers(): Promise<WireguardListResponse> {
	return await api.get({
		url: "/nginx/wireguard",
	});
}
