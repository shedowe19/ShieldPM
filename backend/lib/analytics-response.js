import dayjs from "dayjs";

const number = (value) => Number(value) || 0;

const countItems = (mapper, items = []) => items.map((item) => ({ ...mapper(item), count: number(item.count) }));

const serializeAnalyticsSummary = (summary) => ({
	count: number(summary.stats?.count),
	recentRequests: (summary.recent_requests || []).map((request) => ({
		countryCode: request.country_code || undefined,
		duration: number(request.duration),
		ip: request.ip || "",
		method: request.method || "",
		path: request.path || "",
		status: number(request.status),
		time: request.time,
	})),
	status2xx: number(summary.stats?.status_2xx),
	status3xx: number(summary.stats?.status_3xx),
	status4xx: number(summary.stats?.status_4xx),
	status5xx: number(summary.stats?.status_5xx),
	topCountries: countItems((item) => ({ countryCode: item.country_code || "" }), summary.top_countries),
	topIps: countItems((item) => ({ countryCode: item.country_code || undefined, ip: item.ip || "" }), summary.top_ips),
	topPaths: countItems((item) => ({ path: item.path || "" }), summary.top_paths),
	topReferers: countItems((item) => ({ referer: item.referer || "" }), summary.top_referers),
	topUserAgents: countItems((item) => ({ userAgent: item.user_agent || "" }), summary.top_user_agents),
});

const serializeAnalyticsSeries = (rows, resolution = "minute") => {
	const buckets = new Map();
	for (const row of rows) {
		const bucketUnit = resolution === "hour" ? "hour" : resolution === "day" ? "day" : "minute";
		const timestamp =
			bucketUnit === "minute" ? row.timestamp : dayjs(row.timestamp).startOf(bucketUnit).toISOString();
		const current = buckets.get(timestamp) || { bytes: 0, count: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, timestamp };
		current.bytes += number(row.bytes_sent);
		current.count += number(row.request_count);
		current.s2xx += number(row.status_code_2xx);
		current.s3xx += number(row.status_code_3xx);
		current.s4xx += number(row.status_code_4xx);
		current.s5xx += number(row.status_code_5xx);
		buckets.set(timestamp, current);
	}
	return Array.from(buckets.values()).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
};

export { serializeAnalyticsSeries, serializeAnalyticsSummary };
