import { describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", () => ({
	default: vi.fn(() => ({})),
}));

vi.mock("../../lib/config.js", () => ({
	isSqlite: vi.fn(() => true),
	configGet: vi.fn(),
	configHas: vi.fn(),
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { default: now } = await import("../../models/now_helper.js");

describe("now_helper", () => {
	it("is a function", () => {
		expect(typeof now).toBe("function");
	});

	it("returns a value (Model.raw expression)", () => {
		const result = now();
		expect(result).toBeDefined();
	});
});
