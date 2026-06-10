import dayjs from "dayjs";
import type { AnalyticsRequestLog } from "src/api/backend";
import { describe, expect, it } from "vitest";
import { formatRecentRequestTime, sortRecentRequests } from "./utils";

const makeRequest = (time: string): AnalyticsRequestLog => ({
	time,
	method: "GET",
	status: 200,
	path: "/",
	ip: "127.0.0.1",
	duration: 1,
});

describe("analytics recent request helpers", () => {
	it("sorts recent requests by full timestamp descending", () => {
		const requests = [
			makeRequest("2026-06-10T01:32:48.000Z"),
			makeRequest("2026-06-10T01:02:43.000Z"),
			makeRequest("2026-06-10T01:52:02.000Z"),
		];

		const sorted = sortRecentRequests(requests);

		expect(sorted.map((request) => request.time)).toEqual([
			"2026-06-10T01:52:02.000Z",
			"2026-06-10T01:32:48.000Z",
			"2026-06-10T01:02:43.000Z",
		]);
		expect(requests.map((request) => request.time)).toEqual([
			"2026-06-10T01:32:48.000Z",
			"2026-06-10T01:02:43.000Z",
			"2026-06-10T01:52:02.000Z",
		]);
	});

	it("includes the date in recent request time labels", () => {
		const value = "2026-06-10T01:52:02.000Z";

		expect(formatRecentRequestTime(value)).toBe(dayjs(value).format("YYYY-MM-DD HH:mm:ss"));
		expect(formatRecentRequestTime(value)).not.toBe(dayjs(value).format("HH:mm:ss"));
	});
});
