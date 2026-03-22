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

const { default: ChatIntegration } = await import("../../models/chat_integration.js");

describe("ChatIntegration model", () => {
	it("has correct tableName", () => {
		expect(ChatIntegration.tableName).toBe("chat_integration");
	});

	it("has jsonAttributes including config and meta", () => {
		expect(ChatIntegration.jsonAttributes).toContain("config");
		expect(ChatIntegration.jsonAttributes).toContain("meta");
	});

	it("defines user relation", () => {
		const relations = ChatIntegration.relationMappings;
		expect(relations).toHaveProperty("user");
		expect(relations.user.join.from).toBe("chat_integration.user_id");
		expect(relations.user.join.to).toBe("user.id");
	});

	it("has jsonSchema with required fields", () => {
		const schema = ChatIntegration.jsonSchema;
		expect(schema.required).toContain("provider");
		expect(schema.required).toContain("token");
		expect(schema.required).toContain("user_id");
	});

	it("jsonSchema provider enum only allows telegram", () => {
		const schema = ChatIntegration.jsonSchema;
		expect(schema.properties.provider.enum).toEqual(["telegram"]);
	});

	it("jsonSchema has config.allowed_ids property", () => {
		const schema = ChatIntegration.jsonSchema;
		expect(schema.properties.config.properties.allowed_ids.type).toBe("array");
	});
});
