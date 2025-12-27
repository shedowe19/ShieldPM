import { get } from "./base";

export interface AnalyticsSummary {
	count?: number; // legacy/global support
	status_2xx?: number;
	status_3xx?: number;
	status_4xx?: number;
	status_5xx?: number;
	top_countries?: { country_code: string; count: number }[];
	top_ips?: { ip: string; country_code: string; count: number }[];
	top_referers?: { referer: string; count: number }[];
	top_user_agents?: { user_agent: string; count: number }[];
	top_paths?: { path: string; count: number }[];
	recent_requests?: any[];
}

export const getAnalyticsSummary = (hostId?: number, range = "24h"): Promise<AnalyticsSummary> => {
	const url = hostId ? `/nginx/analytics/${hostId}/summary` : "/nginx/analytics/global/summary";
	return get({ url, params: { range } });
};
