import { describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", () => ({
	default: vi.fn(() => ({})),
}));

vi.mock("../../lib/helpers.js", () => ({
	convertBoolFieldsToInt: vi.fn((json) => json),
	convertIntFieldsToBool: vi.fn((json) => json),
}));

vi.mock("../../lib/config.js", () => ({
	isSqlite: vi.fn(() => true),
	configGet: vi.fn(),
	configHas: vi.fn(),
}));

vi.mock("../../logger.js", () => ({
	global: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((v) => `enc_${v}`),
	decrypt: vi.fn((v) => v),
}));

const { default: DashboardNote } = await import("../../models/dashboard_note.js");

describe("DashboardNote model", () => {
	it("has correct tableName", () => {
		expect(DashboardNote.tableName).toBe("dashboard_note");
	});

	it("has correct static name", () => {
		expect(DashboardNote.name).toBe("DashboardNote");
	});

	it("has no relationMappings", () => {
		expect(DashboardNote.relationMappings).toBeNull();
	});

	it("$beforeInsert sets created_on, modified_on, and default color", () => {
		const instance = new DashboardNote();
		instance.$beforeInsert();
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
		expect(instance.color).toBe("yellow");
	});

	it("$beforeInsert does not override existing color", () => {
		const instance = new DashboardNote();
		instance.color = "blue";
		instance.$beforeInsert();
		expect(instance.color).toBe("blue");
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new DashboardNote();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
