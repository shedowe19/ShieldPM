import * as api from "./base";
import type { DdnsProvider } from "./models";

export async function getDdnsProviders(): Promise<DdnsProvider[]> {
    return await api.get({
        url: "/nginx/ddns-providers",
    });
}
