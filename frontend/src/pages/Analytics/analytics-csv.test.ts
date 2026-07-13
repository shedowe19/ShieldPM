import type { TimeSeriesPoint } from "src/api/backend";
import { describe, expect, it } from "vitest";
import { createAnalyticsCsv } from "./analytics-csv";

const headers = {
	bytes: "Transferred bytes",
	requests: "Total requests",
	time: "Time",
};

describe("analytics CSV export", () => {
	it("writes the selected host time series with localized headers", () => {
		const series: TimeSeriesPoint[] = [
			{
				bytes: 2048,
				count: 42,
				s2xx: 37,
				s3xx: 2,
				s4xx: 2,
				s5xx: 1,
				timestamp: "2026-07-13T12:00:00.000Z",
			},
		];

		expect(createAnalyticsCsv(series, headers)).toBe(
			'"Time","Total requests","Transferred bytes","2xx","3xx","4xx","5xx"\r\n"2026-07-13T12:00:00.000Z","42","2048","37","2","2","1"',
		);
	});

	it("neutralizes formula-like values before writing CSV cells", () => {
		const series = [
			{
				bytes: 0,
				count: 0,
				s2xx: 0,
				s3xx: 0,
				s4xx: 0,
				s5xx: 0,
				timestamp: '=HYPERLINK("https://attacker.invalid")',
			},
		] as TimeSeriesPoint[];

		expect(createAnalyticsCsv(series, headers)).toContain('"\'=HYPERLINK(""https://attacker.invalid"")"');
	});

	it("neutralizes tab-prefixed formulas before writing CSV cells", () => {
		const series = [
			{
				bytes: 0,
				count: 0,
				s2xx: 0,
				s3xx: 0,
				s4xx: 0,
				s5xx: 0,
				timestamp: '	=HYPERLINK("https://attacker.invalid")',
			},
		] as TimeSeriesPoint[];

		expect(createAnalyticsCsv(series, headers)).toContain('"\'	=HYPERLINK(""https://attacker.invalid"")"');
	});
});
