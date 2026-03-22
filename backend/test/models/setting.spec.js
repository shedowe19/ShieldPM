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

const { default: Setting } = await import("../../models/setting.js");

describe("Setting model", () => {
	it("has correct tableName", () => {
		expect(Setting.tableName).toBe("setting");
	});

	it("has correct static name", () => {
		expect(Setting.name).toBe("Setting");
	});

	it("has jsonAttributes including meta", () => {
		expect(Setting.jsonAttributes).toContain("meta");
	});

	it("has no relationMappings", () => {
		expect(Setting.relationMappings).toBeNull();
	});

	it("$beforeInsert sets default meta", () => {
		const instance = new Setting();
		instance.$beforeInsert();
		expect(instance.meta).toEqual({});
	});

	it("$beforeInsert does not override existing meta", () => {
		const instance = new Setting();
		instance.meta = { key: "value" };
		instance.$beforeInsert();
		expect(instance.meta).toEqual({ key: "value" });
	});
});
