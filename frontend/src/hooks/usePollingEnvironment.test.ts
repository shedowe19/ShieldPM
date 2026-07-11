import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPollingInterval } from "./pollingPolicy";
import { usePollingEnvironment } from "./usePollingEnvironment";

let onLineDescriptor: PropertyDescriptor | undefined;
let visibilityStateDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
	onLineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
	visibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
	Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
	Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

afterEach(() => {
	if (onLineDescriptor) {
		Object.defineProperty(navigator, "onLine", onLineDescriptor);
	} else {
		Reflect.deleteProperty(navigator, "onLine");
	}
	if (visibilityStateDescriptor) {
		Object.defineProperty(document, "visibilityState", visibilityStateDescriptor);
	} else {
		Reflect.deleteProperty(document, "visibilityState");
	}
});

describe("usePollingEnvironment", () => {
	it("resumes an eligible polling interval after the document becomes visible and the browser reconnects", () => {
		const { result } = renderHook(() => usePollingEnvironment());
		const interval = () =>
			getPollingInterval({
				baseIntervalMs: 15_000,
				failureCount: 0,
				...result.current,
			});

		expect(interval()).toBe(15_000);

		act(() => {
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(interval()).toBe(false);

		act(() => {
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
			Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
			document.dispatchEvent(new Event("visibilitychange"));
			window.dispatchEvent(new Event("offline"));
		});
		expect(interval()).toBe(false);

		act(() => {
			Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
			window.dispatchEvent(new Event("online"));
		});
		expect(interval()).toBe(15_000);
	});
});
