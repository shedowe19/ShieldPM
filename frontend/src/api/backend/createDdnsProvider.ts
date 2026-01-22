import * as api from "./base";
import type { DdnsProvider } from "./models";

export async function createDdnsProvider(payload: Partial<DdnsProvider>): Promise<DdnsProvider> {
	return await api.post({
		url: "/nginx/ddns-providers",
		data: payload,
	});
}
