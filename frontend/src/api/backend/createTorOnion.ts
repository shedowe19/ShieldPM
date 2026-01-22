import * as api from "./base";
import type { TorOnion } from "./models";

export interface CreateTorOnionPayload {
    name: string;
    proxyHostId?: number;
    virtualPort?: number;
    targetPort: number;
}

export async function createTorOnion(payload: CreateTorOnionPayload): Promise<TorOnion> {
    return await api.post({
        url: "/nginx/tor-onion",
        data: {
            name: payload.name,
            proxy_host_id: payload.proxyHostId,
            virtual_port: payload.virtualPort ?? 80,
            target_port: payload.targetPort,
        },
    });
}
