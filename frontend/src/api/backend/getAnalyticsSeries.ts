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
	// Map backend snake_case to frontend expected format if needed,
	// actually backend returns: timestamp, status_code_2xx, etc.
	// Frontend expects: timestamp (or timeDisplay handled in index), s2xx

	// Backend returns camelCase (Objection/Knex default behavior implicitly active)
	interface BackendAnalyticsItem {
		timestamp: string;
		requestCount: number;
		bytesSent: number;
		statusCode2xx: number;
		statusCode3xx: number;
		statusCode4xx: number;
		statusCode5xx: number;
	}

	return (data as BackendAnalyticsItem[]).map((d) => ({
		timestamp: d.timestamp,
		count: d.requestCount,
		bytes: d.bytesSent,
		s2xx: d.statusCode2xx,
		s3xx: d.statusCode3xx,
		s4xx: d.statusCode4xx,
		s5xx: d.statusCode5xx,
	}));
}
