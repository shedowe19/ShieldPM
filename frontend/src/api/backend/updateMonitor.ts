import * as api from "./base";
import type { Monitor } from "./models";

export async function updateMonitor(id: number, payload: Partial<Monitor>): Promise<Monitor> {
	return await api.put({ url: `/monitoring/${id}`, data: payload });
}
