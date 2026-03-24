import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePageVisibility } from "./usePageVisibility";

describe("usePageVisibility", () => {
	it("returns true when document is visible", () => {
		Object.defineProperty(document, "visibilityState", {
			value: "visible",
			writable: true,
			configurable: true,
		});
		const { result } = renderHook(() => usePageVisibility());
		expect(result.current).toBe(true);
	});

	it("returns false when document is hidden", () => {
		Object.defineProperty(document, "visibilityState", {
			value: "hidden",
			writable: true,
			configurable: true,
		});
		const { result } = renderHook(() => usePageVisibility());
		expect(result.current).toBe(false);
	});

	it("updates when visibility changes", () => {
		Object.defineProperty(document, "visibilityState", {
			value: "visible",
			writable: true,
			configurable: true,
		});
		const { result } = renderHook(() => usePageVisibility());
		expect(result.current).toBe(true);

		act(() => {
			Object.defineProperty(document, "visibilityState", {
				value: "hidden",
				writable: true,
				configurable: true,
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(result.current).toBe(false);
	});

	it("cleans up event listener on unmount", () => {
		const removeSpy = vi.spyOn(document, "removeEventListener");
		const { unmount } = renderHook(() => usePageVisibility());
		unmount();
		expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
		removeSpy.mockRestore();
	});
});

import { vi } from "vitest";
