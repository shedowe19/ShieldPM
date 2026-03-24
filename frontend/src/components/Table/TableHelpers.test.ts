import { describe, expect, it } from "vitest";
import { tableEventReducer, tableEvents } from "./TableHelpers";

describe("tableEventReducer", () => {
	const initialState = {
		limit: 10,
		offset: 0,
		total: 100,
		sortBy: undefined,
		filters: undefined,
	};

	it("PAGE_CHANGED updates offset correctly", () => {
		const result = tableEventReducer(initialState, {
			type: tableEvents.PAGE_CHANGED,
			payload: 3,
		});
		expect(result.offset).toBe(30); // page 3 * limit 10
	});

	it("PAGE_SIZE_CHANGED updates limit", () => {
		const result = tableEventReducer(initialState, {
			type: tableEvents.PAGE_SIZE_CHANGED,
			payload: 25,
		});
		expect(result.limit).toBe(25);
	});

	it("TOTAL_COUNT_CHANGED updates total", () => {
		const result = tableEventReducer(initialState, {
			type: tableEvents.TOTAL_COUNT_CHANGED,
			payload: 42,
		});
		expect(result.total).toBe(42);
	});

	it("SORT_CHANGED updates sortBy", () => {
		const sortBy = { id: "name", desc: true };
		const result = tableEventReducer(initialState, {
			type: tableEvents.SORT_CHANGED,
			payload: sortBy,
		});
		expect(result.sortBy).toEqual(sortBy);
	});

	it("FILTERS_CHANGED updates filters and resets offset", () => {
		const stateWithOffset = { ...initialState, offset: 50 };
		const filters = [{ id: "name", value: "test" }];
		const result = tableEventReducer(stateWithOffset, {
			type: tableEvents.FILTERS_CHANGED,
			payload: filters,
		});
		expect(result.filters).toEqual(filters);
		expect(result.offset).toBe(0); // reset to first page
	});

	it("FILTERS_CHANGED preserves offset if filters reference is same", () => {
		const filters = [{ id: "name", value: "test" }];
		const stateWithFilters = { ...initialState, offset: 50, filters };
		const result = tableEventReducer(stateWithFilters, {
			type: tableEvents.FILTERS_CHANGED,
			payload: filters, // same reference
		});
		expect(result.offset).toBe(50);
	});

	it("throws on unknown action type", () => {
		expect(() =>
			tableEventReducer(initialState, {
				type: "UNKNOWN_EVENT" as never,
				payload: 0,
			} as never),
		).toThrow("Unhandled action type");
	});
});
