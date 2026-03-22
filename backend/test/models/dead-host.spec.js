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

const { default: DeadHost } = await import("../../models/dead_host.js");

describe("DeadHost model", () => {
	it("has correct tableName", () => {
		expect(DeadHost.tableName).toBe("dead_host");
	});

	it("has correct static name", () => {
		expect(DeadHost.name).toBe("DeadHost");
	});

	it("has jsonAttributes including domain_names and meta", () => {
		expect(DeadHost.jsonAttributes).toContain("domain_names");
		expect(DeadHost.jsonAttributes).toContain("meta");
	});

	it("defines owner and certificate relations", () => {
		const relations = DeadHost.relationMappings;
		expect(relations).toHaveProperty("owner");
		expect(relations).toHaveProperty("certificate");
		expect(relations.owner.join.from).toBe("dead_host.owner_user_id");
		expect(relations.certificate.join.from).toBe("dead_host.certificate_id");
		expect(relations.certificate.join.to).toBe("certificate.id");
	});

	it("$beforeInsert sets defaults for domain_names and meta", () => {
		const instance = new DeadHost();
		instance.$beforeInsert();
		expect(instance.domain_names).toEqual([]);
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new DeadHost();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
