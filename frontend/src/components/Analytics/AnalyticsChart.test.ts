import { describe, expect, it } from "vitest";
import { formatAnalyticsTooltipTimestamp } from "./AnalyticsChart";

describe("formatAnalyticsTooltipTimestamp", () => {
	it("formats numeric Unix-second tooltip labels", () => {
		const timestamp = 1_700_000_000;

		expect(formatAnalyticsTooltipTimestamp(timestamp)).toBe(new Date(timestamp * 1000).toLocaleString());
	});

	it("rejects non-numeric tooltip labels instead of rendering an invalid date", () => {
		expect(formatAnalyticsTooltipTimestamp("not-a-timestamp")).toBe("");
		expect(formatAnalyticsTooltipTimestamp(null)).toBe("");
	});
});
