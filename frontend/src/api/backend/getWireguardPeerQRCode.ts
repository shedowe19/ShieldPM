import * as api from "./base";

export async function getWireguardPeerQRCode(id: number): Promise<{ qrcode: string }> {
	return await api.get({
		url: `/nginx/wireguard/${id}/qrcode`,
	});
}
