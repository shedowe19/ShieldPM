import * as api from "./base";

export interface AnalyticsStatus {
	rxSec: number;
	txSec: number;
	totalSec: number;
}

export async function getAnalyticsStatus(signal?: AbortSignal): Promise<AnalyticsStatus> {
	return await api.get({ url: "/analytics/status" }, signal ? { signal } : undefined);
}
