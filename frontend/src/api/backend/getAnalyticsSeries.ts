import { get } from "./base";

export interface TimeSeriesPoint {
	time_bucket?: number;
	count: number;
	bytes: number;
	s2xx: number;
	s3xx: number;
	s4xx: number;
	s5xx: number;
	// Helper for checking if date parsing works
	timestamp?: string;
}

export async function getAnalyticsSeries(hostId?: number, range = "24h"): Promise<TimeSeriesPoint[]> {
	const url = hostId ? `/nginx/analytics/${hostId}` : "/nginx/analytics/global";
	const data = await get({ url, params: { range } });
	return data as TimeSeriesPoint[];
}
