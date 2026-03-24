import { describe, expect, it } from "vitest";
import { buildFilters, tableFiltersToAPI, tableSortToAPI } from "./helpers";

describe("tableSortToAPI", () => {
	it("returns undefined for empty array", () => {
		expect(tableSortToAPI([])).toBeUndefined();
	});

	it("returns undefined for undefined-ish input", () => {
		expect(tableSortToAPI(undefined as never)).toBeUndefined();
	});

	it("converts single ascending sort", () => {
		expect(tableSortToAPI([{ id: "name", desc: false }])).toBe("name.asc");
	});

	it("converts single descending sort", () => {
		expect(tableSortToAPI([{ id: "name", desc: true }])).toBe("name.desc");
	});

	it("converts multiple sorts", () => {
		const result = tableSortToAPI([
			{ id: "name", desc: false },
			{ id: "createdOn", desc: true },
		]);
		expect(result).toBe("name.asc,created_on.desc");
	});

	it("decamelizes camelCase field names", () => {
		expect(tableSortToAPI([{ id: "domainNames", desc: false }])).toBe("domain_names.asc");
	});
});

describe("tableFiltersToAPI", () => {
	it("returns empty object for empty array", () => {
		expect(tableFiltersToAPI([])).toEqual({});
	});

	it("converts single filter", () => {
		const result = tableFiltersToAPI([{ id: "name", value: { modifier: "contains", value: "test" } }]);
		expect(result).toEqual({ "name:contains": "test" });
	});

	it("converts multiple filters", () => {
		const result = tableFiltersToAPI([
			{ id: "name", value: { modifier: "contains", value: "jam" } },
			{ id: "email", value: { modifier: "equals", value: "a@b.com" } },
		]);
		expect(result).toEqual({
			"name:contains": "jam",
			"email:equals": "a@b.com",
		});
	});

	it("decamelizes camelCase filter ids", () => {
		const result = tableFiltersToAPI([{ id: "domainNames", value: { modifier: "contains", value: "x" } }]);
		expect(result).toEqual({ "domain_names:contains": "x" });
	});
});

describe("buildFilters", () => {
	it("returns undefined/null as-is when no filters given", () => {
		expect(buildFilters(undefined)).toBeUndefined();
	});

	it("strips undefined values", () => {
		expect(buildFilters({ a: "hello", b: undefined })).toEqual({ a: "hello" });
	});

	it("strips null values", () => {
		expect(buildFilters({ a: "hello", b: null })).toEqual({ a: "hello" });
	});

	it("strips empty string values", () => {
		expect(buildFilters({ a: "hello", b: "" })).toEqual({ a: "hello" });
	});

	it("converts boolean values to string", () => {
		expect(buildFilters({ enabled: true, disabled: false })).toEqual({
			enabled: "true",
			disabled: "false",
		});
	});

	it("returns empty object when all values are empty", () => {
		expect(buildFilters({ a: undefined, b: null, c: "" })).toEqual({});
	});
});
