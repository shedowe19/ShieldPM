import { describe, expect, it } from "vitest";
import { resolveRollupLateWindow } from "../../lib/analytics-retention.js";
import {
	bucketKeyFor,
	hourBucketEndIso,
	hourBucketStartIso,
	proxyHostIdFromBucketKey,
	resolveDetailPruneCutoff,
	resolveRollupBuckets,
} from "../../lib/analytics-rollup.js";

describe("hourly analytics bucket boundaries", () => {
	it("uses UTC hour boundaries regardless of the local time zone", () => {
		expect(hourBucketStartIso("2026-11-23T10:00:00.000Z")).toBe("2026-11-23T10:00:00.000Z");
		expect(hourBucketStartIso("2026-11-23T10:59:59.999Z")).toBe("2026-11-23T10:00:00.000Z");
		expect(hourBucketStartIso("2026-11-23T11:00:00.000Z")).toBe("2026-11-23T11:00:00.000Z");
		expect(hourBucketEndIso("2026-11-23T10:00:00.000Z")).toBe("2026-11-23T11:00:00.000Z");
		expect(hourBucketStartIso("not a timestamp")).toBeNull();
	});

	it("keeps the global bucket distinct from real host ids", () => {
		expect(bucketKeyFor(0)).toBe("global");
		expect(bucketKeyFor(null)).toBe("global");
		expect(bucketKeyFor(7)).toBe("host:7");
		expect(proxyHostIdFromBucketKey("host:7")).toBe(7);
		expect(proxyHostIdFromBucketKey("global")).toBeNull();
		expect(proxyHostIdFromBucketKey("host:not-a-number")).toBeNull();
	});
});

describe("hourly rollup planning", () => {
	const now = "2026-11-23T12:05:00.000Z";

	it("starts at the earliest raw row on the first run and stops at the last completed hour", () => {
		const plan = resolveRollupBuckets({ earliestRaw: "2026-11-23T09:59:59.000Z", now, graceMs: 0 });

		expect(plan.buckets).toEqual([
			"2026-11-23T09:00:00.000Z",
			"2026-11-23T10:00:00.000Z",
			"2026-11-23T11:00:00.000Z",
		]);
		expect(plan.nextWatermark).toBe("2026-11-23T11:00:00.000Z");
	});

	it("waits for the grace period before finalizing the hour that just ended", () => {
		const withGrace = resolveRollupBuckets({
			earliestRaw: "2026-11-23T09:00:00.000Z",
			graceMs: 10 * 60 * 1000,
			now,
		});
		expect(withGrace.buckets).toEqual(["2026-11-23T09:00:00.000Z", "2026-11-23T10:00:00.000Z"]);

		const afterGrace = resolveRollupBuckets({
			earliestRaw: "2026-11-23T09:00:00.000Z",
			graceMs: 2 * 60 * 1000,
			now,
		});
		expect(afterGrace.nextWatermark).toBe("2026-11-23T11:00:00.000Z");
	});

	it("recomputes the late window and adds the new hours after a watermark", () => {
		const plan = resolveRollupBuckets({
			earliestRaw: "2026-11-23T08:00:00.000Z",
			lateWindowHours: 2,
			now,
			watermark: "2026-11-23T10:00:00.000Z",
		});

		expect(plan.buckets).toEqual([
			"2026-11-23T09:00:00.000Z",
			"2026-11-23T10:00:00.000Z",
			"2026-11-23T11:00:00.000Z",
		]);
		expect(plan.nextWatermark).toBe("2026-11-23T11:00:00.000Z");
	});

	it("does not rescan committed hours when no late rows arrived", () => {
		const plan = resolveRollupBuckets({
			earliestRaw: "2026-11-23T08:00:00.000Z",
			lateWindowHours: 3,
			now,
			recomputeLate: false,
			watermark: "2026-11-23T10:00:00.000Z",
		});

		expect(plan.buckets).toEqual(["2026-11-23T11:00:00.000Z"]);
		expect(plan.nextWatermark).toBe("2026-11-23T11:00:00.000Z");
	});

	it("never recomputes committed hours when the detail retention disables the late window", () => {
		const plan = resolveRollupBuckets({
			earliestRaw: "2026-11-23T08:00:00.000Z",
			lateWindowHours: 0,
			now,
			watermark: "2026-11-23T10:00:00.000Z",
		});

		expect(plan.buckets).toEqual(["2026-11-23T11:00:00.000Z"]);
	});

	it("caps one run and resumes from the last committed bucket", () => {
		const plan = resolveRollupBuckets({
			earliestRaw: "2026-11-20T00:00:00.000Z",
			maxBuckets: 2,
			now,
		});

		expect(plan.buckets).toEqual(["2026-11-20T00:00:00.000Z", "2026-11-20T01:00:00.000Z"]);
		expect(plan.nextWatermark).toBe("2026-11-20T01:00:00.000Z");
	});

	it("skips over hours whose raw detail rows are already gone", () => {
		const plan = resolveRollupBuckets({
			earliestRaw: "2026-11-23T11:30:00.000Z",
			now,
			watermark: "2026-11-20T00:00:00.000Z",
		});

		expect(plan.buckets).toEqual(["2026-11-23T11:00:00.000Z"]);
		expect(plan.skippedBefore).toBe("2026-11-20T01:00:00.000Z");
		expect(plan.nextWatermark).toBe("2026-11-23T11:00:00.000Z");
	});

	it("keeps the watermark while recomputing the late window", () => {
		const plan = resolveRollupBuckets({
			earliestRaw: "2026-11-23T08:00:00.000Z",
			lateWindowHours: 3,
			now,
			watermark: "2026-11-23T11:00:00.000Z",
		});

		expect(plan.buckets).toEqual([
			"2026-11-23T09:00:00.000Z",
			"2026-11-23T10:00:00.000Z",
			"2026-11-23T11:00:00.000Z",
		]);
		expect(plan.nextWatermark).toBe("2026-11-23T11:00:00.000Z");
	});
});

describe("raw detail retention safety", () => {
	it("shrinks the rollup late window to stay inside the detail retention", () => {
		expect(resolveRollupLateWindow({ detailedHours: 24, lateWindowHours: 3 })).toBe(3);
		expect(resolveRollupLateWindow({ detailedHours: 2, lateWindowHours: 3 })).toBe(1);
		expect(resolveRollupLateWindow({ detailedHours: 1, lateWindowHours: 3 })).toBe(0);
		expect(resolveRollupLateWindow({ detailedHours: 24, lateWindowHours: 0 })).toBe(0);
	});

	it("never prunes past the committed hourly coverage", () => {
		expect(
			resolveDetailPruneCutoff({
				coveredThrough: "2026-11-22T10:00:00.000Z",
				detailedCutoff: "2026-11-22T12:00:00.000Z",
			}),
		).toBe("2026-11-22T10:00:00.000Z");
	});

	it("uses the configured cutoff when the rollup covers the whole retention window", () => {
		expect(
			resolveDetailPruneCutoff({
				coveredThrough: "2026-11-23T10:00:00.000Z",
				detailedCutoff: "2026-11-22T12:00:00.000Z",
			}),
		).toBe("2026-11-22T12:00:00.000Z");
	});

	it("refuses to prune when no rollup has been committed", () => {
		expect(
			resolveDetailPruneCutoff({
				coveredThrough: null,
				detailedCutoff: "2026-11-22T12:00:00.000Z",
			}),
		).toBeNull();
	});
});
