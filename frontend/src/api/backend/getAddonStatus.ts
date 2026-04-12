import * as api from "./base";

export interface AddonStatus {
	anubis: boolean;
	cloudflared: boolean;
	wireguard: boolean;
	tor: boolean;
	oauth2Proxy: boolean;
}

export async function getAddonStatus(): Promise<AddonStatus> {
	return await api.get<AddonStatus>({
		url: "/addons/status",
	});
}
