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

const { default: Stream } = await import("../../models/stream.js");

describe("Stream model", () => {
	it("has correct tableName", () => {
		expect(Stream.tableName).toBe("stream");
	});

	it("has correct static name", () => {
		expect(Stream.name).toBe("Stream");
	});

	it("has jsonAttributes including meta", () => {
		expect(Stream.jsonAttributes).toContain("meta");
	});

	it("defines owner and certificate relations", () => {
		const relations = Stream.relationMappings;
		expect(relations).toHaveProperty("owner");
		expect(relations).toHaveProperty("certificate");
		expect(relations.owner.join.from).toBe("stream.owner_user_id");
		expect(relations.certificate.join.from).toBe("stream.certificate_id");
		expect(relations.certificate.join.to).toBe("certificate.id");
	});

	it("$beforeInsert sets defaults", () => {
		const instance = new Stream();
		instance.$beforeInsert();
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new Stream();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
