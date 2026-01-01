import * as api from "./base";
import type { CloudflaredTunnel } from "./models";

export interface UpdateCloudflaredTunnelPayload {
    name?: string;
    token?: string;
}

export async function updateCloudflaredTunnel(id: number, payload: UpdateCloudflaredTunnelPayload): Promise<CloudflaredTunnel> {
    return await api.put({
        url: `/nginx/cloudflared-tunnels/${id}`,
        data: payload,
    });
}
