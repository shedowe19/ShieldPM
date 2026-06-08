import { get } from "./base";

export interface AnalyticsSummary {
	count?: number; // legacy/global support
	status2xx?: number;
	status3xx?: number;
	status4xx?: number;
	status5xx?: number;
	topCountries?: { countryCode: string; count: number }[];
	topIps?: { ip: string; countryCode: string; count: number }[];
	topReferers?: { referer: string; count: number }[];
	topUserAgents?: { userAgent: string; count: number }[];
	topPaths?: { path: string; count: number }[];
	recentRequests?: AnalyticsRequestLog[];
}

export interface AnalyticsRequestLog {
	time: string;
	method: string;
	status: number;
	path: string;
	ip: string;
	countryCode?: string;
	duration: number;
	http3?: string | null;
	sslEarlyData?: string | null;
	sslSigalg?: string | null;
	sslClientSigalg?: string | null;
}

export const getAnalyticsSummary = (hostId?: number, range = "24h"): Promise<AnalyticsSummary> => {
	const url = hostId ? `/nginx/analytics/${hostId}/summary` : "/nginx/analytics/global/summary";
	return get({ url, params: { range } }) as Promise<AnalyticsSummary>;
};
