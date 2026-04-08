import * as api from "./base";

export async function deleteWireguardPeer(id: number): Promise<void> {
	return await api.del({
		url: `/nginx/wireguard/${id}`,
	});
}
