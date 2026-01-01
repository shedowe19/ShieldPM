import * as api from "./base";
import type { CloudflaredTunnel } from "./models";

export async function getCloudflaredTunnels(): Promise<CloudflaredTunnel[]> {
    return await api.get({
        url: "/nginx/cloudflared-tunnels",
    });
}
