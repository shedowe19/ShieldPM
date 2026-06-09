import dayjs from "dayjs";
import type { AnalyticsRequestLog } from "src/api/backend";

const toTimestamp = (request: AnalyticsRequestLog): number => {
	const timestamp = Date.parse(request.time);
	return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
};

export const sortRecentRequests = (requests: AnalyticsRequestLog[] = []): AnalyticsRequestLog[] =>
	[...requests].sort((left, right) => toTimestamp(right) - toTimestamp(left));

export const formatRecentRequestTime = (time: string): string => {
	const parsed = dayjs(time);
	return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm:ss") : time;
};
