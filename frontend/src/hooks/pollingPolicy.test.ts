import { describe, expect, it } from "vitest";
import { getPollingInterval } from "./pollingPolicy";

describe("getPollingInterval", () => {
	it("returns the base interval while the document is visible and online", () => {
		expect(
			getPollingInterval({ baseIntervalMs: 15_000, failureCount: 0, isDocumentVisible: true, isOnline: true }),
		).toBe(15_000);
	});

	it("pauses polling while the document is hidden or the browser is offline", () => {
		expect(
			getPollingInterval({ baseIntervalMs: 15_000, failureCount: 0, isDocumentVisible: false, isOnline: true }),
		).toBe(false);
		expect(
			getPollingInterval({ baseIntervalMs: 15_000, failureCount: 0, isDocumentVisible: true, isOnline: false }),
		).toBe(false);
	});

	it("backs off failed requests exponentially without exceeding the configured maximum", () => {
		expect(
			getPollingInterval({
				baseIntervalMs: 15_000,
				failureCount: 2,
				isDocumentVisible: true,
				isOnline: true,
				maxIntervalMs: 60_000,
			}),
		).toBe(60_000);
		expect(
			getPollingInterval({
				baseIntervalMs: 15_000,
				failureCount: 3,
				isDocumentVisible: true,
				isOnline: true,
				maxIntervalMs: 60_000,
			}),
		).toBe(60_000);
	});
});
