import { get } from "./base";

export interface TimeSeriesPoint {
	time_bucket: number;
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

	// Assuming backend returns array of objects
	if (data.length > 0) console.log("First series item keys:", Object.keys(data[0]), data[0]);
	return data.map((d: any) => ({
		timestamp: d.timestamp,
		count: d.request_count,
		bytes: d.bytes_sent,
		s2xx: d.status_code_2xx,
		s3xx: d.status_code_3xx,
		s4xx: d.status_code_4xx,
		s5xx: d.status_code_5xx
	}));
}
