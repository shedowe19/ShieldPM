import * as api from "./base";
import type { MonitorCheck } from "./models";

export async function getMonitorChecks(id: number, limit = 100): Promise<MonitorCheck[]> {
	return await api.get({ url: `/monitoring/${id}/checks`, params: { limit } });
}
