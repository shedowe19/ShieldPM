import * as api from "./base";
import type { CloudflaredTunnel } from "./models";

export interface CreateCloudflaredTunnelPayload {
	name: string;
	token: string;
}

export async function createCloudflaredTunnel(payload: CreateCloudflaredTunnelPayload): Promise<CloudflaredTunnel> {
	return await api.post({
		url: "/nginx/cloudflared-tunnels",
		data: payload,
	});
}
