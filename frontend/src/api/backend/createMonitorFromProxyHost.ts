import * as api from "./base";
import type { Monitor } from "./models";

export async function createMonitorFromProxyHost(proxyHostId: number): Promise<Monitor> {
	return await api.post({ url: `/monitoring/from-proxy-host/${proxyHostId}` });
}
