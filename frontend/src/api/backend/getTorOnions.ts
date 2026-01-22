import * as api from "./base";
import type { TorOnionListResponse } from "./models";

export async function getTorOnions(): Promise<TorOnionListResponse> {
    return await api.get({
        url: "/nginx/tor-onion",
    });
}
