import { describe, expect, it } from "vitest";
import { serializeAnalyticsSeries, serializeAnalyticsSummary } from "../../lib/analytics-response.js";

describe("analytics API response serialization", () => {
	it("maps database-shaped summary fields to the frontend contract", () => {
		expect(
			serializeAnalyticsSummary({
				stats: { count: "12", status_2xx: "9", status_3xx: "1", status_4xx: "1", status_5xx: "1" },
				top_countries: [{ country_code: "DE", count: "5" }],
				top_ips: [{ country_code: "DE", count: "4", ip: "198.51.100.7" }],
				top_paths: [{ count: "3", path: "/health" }],
				top_referers: [{ count: "2", referer: "https://example.test/" }],
				top_user_agents: [{ count: "1", user_agent: "ShieldPM test agent" }],
				recent_requests: [
					{
						country_code: "DE",
						duration: 12,
						ip: "198.51.100.7",
						method: "GET",
						path: "/health",
						status: 200,
						time: "2026-09-18T12:00:00.000Z",
					},
				],
			}),
		).toEqual({
			count: 12,
			recentRequests: [
				{
					countryCode: "DE",
					duration: 12,
					ip: "198.51.100.7",
					method: "GET",
					path: "/health",
					status: 200,
					time: "2026-09-18T12:00:00.000Z",
				},
			],
			status2xx: 9,
			status3xx: 1,
			status4xx: 1,
			status5xx: 1,
			topCountries: [{ countryCode: "DE", count: 5 }],
			topIps: [{ countryCode: "DE", count: 4, ip: "198.51.100.7" }],
			topPaths: [{ count: 3, path: "/health" }],
			topReferers: [{ count: 2, referer: "https://example.test/" }],
			topUserAgents: [{ count: 1, userAgent: "ShieldPM test agent" }],
		});
	});

	it("maps snake_case aggregate rows to chart points without relying on ORM casing", () => {
		expect(
			serializeAnalyticsSeries([
				{
					bytes_sent: "1024",
					request_count: "6",
					status_code_2xx: "5",
					status_code_3xx: "1",
					status_code_4xx: "0",
					status_code_5xx: "0",
					timestamp: "2026-09-18T12:00:00.000Z",
				},
			]),
		).toEqual([
			{
				bytes: 1024,
				count: 6,
				s2xx: 5,
				s3xx: 1,
				s4xx: 0,
				s5xx: 0,
				timestamp: "2026-09-18T12:00:00.000Z",
			},
		]);
	});

	it("downsamples long-range raw minute rows into bounded bucket totals", () => {
		expect(
			serializeAnalyticsSeries(
				[
					{
						bytes_sent: 100,
						request_count: 1,
						status_code_2xx: 1,
						status_code_3xx: 0,
						status_code_4xx: 0,
						status_code_5xx: 0,
						timestamp: "2026-09-18T12:01:00.000Z",
					},
					{
						bytes_sent: 200,
						request_count: 2,
						status_code_2xx: 1,
						status_code_3xx: 1,
						status_code_4xx: 0,
						status_code_5xx: 0,
						timestamp: "2026-09-18T12:59:00.000Z",
					},
				],
				"hour",
			),
		).toEqual([
			{
				bytes: 300,
				count: 3,
				s2xx: 2,
				s3xx: 1,
				s4xx: 0,
				s5xx: 0,
				timestamp: "2026-09-18T12:00:00.000Z",
			},
		]);
	});
});
