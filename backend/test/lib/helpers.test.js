import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDatePeriod } from "../../lib/helpers.js";

describe("parseDatePeriod", () => {
	beforeEach(() => {
		vi.stubEnv("TZ", "UTC");
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-13T12:34:56.789Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it.each([
		["30d", "2026-11-12T12:34:56.789Z"],
		["1y", "2027-10-13T12:34:56.789Z"],
		["1Q", "2027-01-13T12:34:56.789Z"],
	])("adds %s to the frozen current date", (expression, expected) => {
		expect(parseDatePeriod(expression).toISOString()).toBe(expected);
	});

	it("keeps calendar year semantics for a leap-day expiration", () => {
		vi.setSystemTime(new Date("2024-02-29T12:34:56.789Z"));
		expect(parseDatePeriod("1y").toISOString()).toBe("2025-02-28T12:34:56.789Z");
	});

	it("returns null for an invalid period expression", () => {
		expect(parseDatePeriod("invalid")).toBeNull();
	});
});
