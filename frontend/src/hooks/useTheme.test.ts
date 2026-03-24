import { describe, expect, it, vi } from "vitest";

vi.mock("src/context", () => ({
	useTheme: () => ({
		theme: "dark",
		toggleTheme: vi.fn(),
		setTheme: vi.fn(),
		getTheme: () => "dark",
	}),
	Dark: "dark",
	Light: "light",
}));

import { Dark, Light, useTheme } from "./useTheme";

describe("useTheme", () => {
	it("re-exports Dark and Light constants", () => {
		expect(Dark).toBe("dark");
		expect(Light).toBe("light");
	});

	it("returns theme context values", () => {
		const ctx = useTheme();
		expect(ctx.theme).toBe("dark");
		expect(typeof ctx.toggleTheme).toBe("function");
		expect(typeof ctx.setTheme).toBe("function");
		expect(ctx.getTheme()).toBe("dark");
	});
});
