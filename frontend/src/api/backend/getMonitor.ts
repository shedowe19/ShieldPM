import * as api from "./base";
import type { Monitor } from "./models";

export async function getMonitor(id: number): Promise<Monitor> {
	return await api.get({ url: `/monitoring/${id}` });
}
