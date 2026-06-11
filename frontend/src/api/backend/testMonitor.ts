import * as api from "./base";
import type { MonitorCheck } from "./models";

export async function testMonitor(id: number): Promise<MonitorCheck> {
	return await api.post({ url: `/monitoring/${id}/test` });
}
