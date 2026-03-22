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

const { default: AuditLog } = await import("../../models/audit-log.js");

describe("AuditLog model", () => {
	it("has correct tableName", () => {
		expect(AuditLog.tableName).toBe("audit_log");
	});

	it("has correct static name", () => {
		expect(AuditLog.name).toBe("AuditLog");
	});

	it("has jsonAttributes including meta", () => {
		expect(AuditLog.jsonAttributes).toContain("meta");
	});

	it("defines user relation", () => {
		const relations = AuditLog.relationMappings;
		expect(relations).toHaveProperty("user");
		expect(relations.user.join.from).toBe("audit_log.user_id");
		expect(relations.user.join.to).toBe("user.id");
	});

	it("$beforeInsert sets created_on, modified_on, and meta defaults", () => {
		const instance = new AuditLog();
		instance.$beforeInsert();
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
		expect(instance.meta).toEqual({});
	});

	it("$beforeInsert does not override existing meta", () => {
		const instance = new AuditLog();
		instance.meta = { foo: "bar" };
		instance.$beforeInsert();
		expect(instance.meta).toEqual({ foo: "bar" });
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new AuditLog();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
