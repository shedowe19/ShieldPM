import { describe, expect, it } from "vitest";
import { flowLineWidth, rateDescription } from "./TrafficFlowRate";

describe("traffic flow common rate scale", () => {
	it("maps equal rates equally and caps the documented scale", () => {
		expect(flowLineWidth(0)).toBe(2);
		expect(flowLineWidth(null)).toBe(2);
		expect(flowLineWidth(1024)).toBe(3);
		expect(flowLineWidth(65536)).toBeGreaterThan(flowLineWidth(1024));
		expect(flowLineWidth(16777216)).toBe(16);
		expect(flowLineWidth(1e12)).toBe(16);
	});
	it("keeps exact measured decimals and both interval bounds separate from smoothing", () => {
		const details = rateDescription({
			uploadBytesPerSecond: 123.456,
			downloadBytesPerSecond: 0,
			bytesPerSecond: 123.456,
			smoothedBytesPerSecond: 999,
			windowStart: "start",
			windowEnd: "end",
			samples: 2,
		});
		expect(details).toContain("Upload: 123.456 B/s");
		expect(details).toContain("Download: 0 B/s");
		expect(details).toContain("Smoothed display: 999 B/s");
		expect(details).toContain("start to end");
		expect(rateDescription(null, true)).toContain("incomplete");
	});
});
