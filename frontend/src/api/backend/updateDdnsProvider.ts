import * as api from "./base";
import type { DdnsProvider } from "./models";

export async function updateDdnsProvider(id: number, payload: Partial<DdnsProvider>): Promise<DdnsProvider> {
    return await api.put({
        url: `/nginx/ddns-providers/${id}`,
        data: payload,
    });
}
