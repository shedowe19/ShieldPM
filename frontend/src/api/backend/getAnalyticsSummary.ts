import * as api from "./base";

export interface AnalyticsSummary {
    count: number;
    bytes: number;
    status_2xx: number;
    status_3xx: number;
    status_4xx: number;
    status_5xx: number;
}

export async function getAnalyticsSummary(params = {}): Promise<AnalyticsSummary> {
    return await api.get({
        url: "/analytics/summary",
        params: params,
    });
}
