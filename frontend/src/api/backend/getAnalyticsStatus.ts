import * as api from "./base";

export interface AnalyticsStatus {
	rxSec: number;
	txSec: number;
	totalSec: number;
}

export async function getAnalyticsStatus(): Promise<AnalyticsStatus> {
	return await api.get({ url: "/analytics/status" });
}
