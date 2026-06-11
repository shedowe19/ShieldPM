import * as api from "./base";
import type { Monitor } from "./models";

export async function createMonitor(payload: Partial<Monitor>): Promise<Monitor> {
	return await api.post({ url: "/monitoring", data: payload });
}
