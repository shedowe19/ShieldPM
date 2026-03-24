import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn (classname merger)", () => {
	it("merges simple class names", () => {
		expect(cn("foo", "bar")).toBe("foo bar");
	});

	it("handles conditional classes", () => {
		expect(cn("base", false && "hidden", "visible")).toBe("base visible");
	});

	it("handles undefined and null inputs", () => {
		expect(cn("base", undefined, null)).toBe("base");
	});

	it("merges conflicting tailwind classes (last wins)", () => {
		expect(cn("p-4", "p-2")).toBe("p-2");
	});

	it("merges tailwind variants correctly", () => {
		expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
	});

	it("returns empty string for no arguments", () => {
		expect(cn()).toBe("");
	});

	it("handles array inputs via clsx", () => {
		expect(cn(["a", "b"], "c")).toBe("a b c");
	});

	it("handles object inputs via clsx", () => {
		expect(cn({ active: true, disabled: false })).toBe("active");
	});
});
