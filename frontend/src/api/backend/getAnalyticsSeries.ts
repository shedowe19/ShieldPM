import * as api from "./base";

export interface TimeSeriesPoint {
    timestamp: string;
    count: number;
    bytes: number;
    s2xx: number;
    s3xx: number;
    s4xx: number;
    s5xx: number;
}

export async function getAnalyticsSeries(params = {}): Promise<TimeSeriesPoint[]> {
    return await api.get({
        url: "/analytics/series",
        params: params,
    });
}
