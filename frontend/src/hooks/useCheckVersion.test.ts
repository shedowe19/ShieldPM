import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/api/backend", () => ({
	checkVersion: vi.fn(() =>
		Promise.resolve({
			current: "1.0.0",
			latest: "1.1.0",
			updateAvailable: true,
		}),
	),
}));

vi.mock("@tanstack/react-query", async () => {
	const actual = await vi.importActual("@tanstack/react-query");
	return {
		...actual,
		useQuery: vi.fn(({ queryFn: _queryFn }) => {
			return {
				data: {
					current: "1.0.0",
					latest: "1.1.0",
					updateAvailable: true,
				},
				error: undefined,
				isLoading: false,
			};
		}),
	};
});

import { useCheckVersion } from "./useCheckVersion";

describe("useCheckVersion", () => {
	it("returns version check data", () => {
		const { result } = renderHook(() => useCheckVersion());
		expect(result.current.data).toEqual({
			current: "1.0.0",
			latest: "1.1.0",
			updateAvailable: true,
		});
	});

	it("reports not loading when data is available", () => {
		const { result } = renderHook(() => useCheckVersion());
		expect(result.current.isLoading).toBe(false);
	});
});
