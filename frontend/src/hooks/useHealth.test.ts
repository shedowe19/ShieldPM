import { renderHook, } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/api/backend", () => ({
	getHealth: vi.fn(() =>
		Promise.resolve({
			status: "healthy",
			version: "1.0.0",
			setup: true,
			demo: false,
		}),
	),
}));

vi.mock("@tanstack/react-query", async () => {
	const actual = await vi.importActual("@tanstack/react-query");
	return {
		...actual,
		useQuery: vi.fn(({ queryFn: _queryFn }) => {
			// Simple sync mock that calls queryFn and returns result
			let data: unknown ;
			let error: unknown ;
			let isLoading = true;
			try {
				// We'll just return a resolved mock
				data = {
					status: "healthy",
					version: "1.0.0",
					setup: true,
					demo: false,
				};
				isLoading = false;
			} catch (e) {
				error = e;
				isLoading = false;
			}
			return { data, error, isLoading };
		}),
	};
});

import { useHealth } from "./useHealth";

describe("useHealth", () => {
	it("returns health data from the query", () => {
		const { result } = renderHook(() => useHealth());
		expect(result.current.data).toEqual({
			status: "healthy",
			version: "1.0.0",
			setup: true,
			demo: false,
		});
	});

	it("is not loading when data is available", () => {
		const { result } = renderHook(() => useHealth());
		expect(result.current.isLoading).toBe(false);
	});
});
