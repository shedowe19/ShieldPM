import * as api from "./base";

export interface WireguardSettings {
	endpoint: string;
	listen_port: number;
	subnet: string;
	server_address: string;
}

export async function getWireguardSettings(): Promise<WireguardSettings> {
	return await api.get<WireguardSettings>({ url: "/nginx/wireguard/settings" });
}

export async function updateWireguardSettings(
	settings: Partial<WireguardSettings>,
): Promise<WireguardSettings> {
	return await api.put<WireguardSettings>({ url: "/nginx/wireguard/settings", data: settings });
}
