import * as api from "./base";

export interface AnalyticsSummary {
	count: number;
	bytes: number;
	status_2xx: number;
	status_3xx: number;
	status_4xx: number;
	status_5xx: number;
	// Fallback keys observed in production
	status2xx?: number;
	status3xx?: number;
	status4xx?: number;
	status5xx?: number;
}

export async function getAnalyticsSummary(params = {}): Promise<AnalyticsSummary> {
	return await api.get({
		url: "/analytics/summary",
		params: params,
	});
}
