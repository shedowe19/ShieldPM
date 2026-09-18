import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { resolveAnalyticsRange } from "../../lib/analytics-range.js";

describe("analytics range policy", () => {
	it("selects bounded chart resolutions for every supported reporting range", () => {
		const now = dayjs("2026-09-18T12:00:00.000Z");

		expect(resolveAnalyticsRange("1h", now)).toMatchObject({ range: "1h", resolution: "minute" });
		expect(resolveAnalyticsRange("24h", now)).toMatchObject({ range: "24h", resolution: "minute" });
		expect(resolveAnalyticsRange("7d", now)).toMatchObject({ range: "7d", resolution: "hour" });
		expect(resolveAnalyticsRange("30d", now)).toMatchObject({ range: "30d", resolution: "day" });
		expect(resolveAnalyticsRange("invalid", now)).toMatchObject({ range: "24h", resolution: "minute" });
	});
});
