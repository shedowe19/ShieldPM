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

const { default: RedirectionHost } = await import("../../models/redirection_host.js");

describe("RedirectionHost model", () => {
	it("has correct tableName", () => {
		expect(RedirectionHost.tableName).toBe("redirection_host");
	});

	it("has correct static name", () => {
		expect(RedirectionHost.name).toBe("RedirectionHost");
	});

	it("has jsonAttributes including domain_names and meta", () => {
		expect(RedirectionHost.jsonAttributes).toContain("domain_names");
		expect(RedirectionHost.jsonAttributes).toContain("meta");
	});

	it("defines owner and certificate relations", () => {
		const relations = RedirectionHost.relationMappings;
		expect(relations).toHaveProperty("owner");
		expect(relations).toHaveProperty("certificate");
		expect(relations.owner.join.from).toBe("redirection_host.owner_user_id");
		expect(relations.certificate.join.from).toBe("redirection_host.certificate_id");
	});

	it("$beforeInsert sets defaults", () => {
		const instance = new RedirectionHost();
		instance.$beforeInsert();
		expect(instance.domain_names).toEqual([]);
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new RedirectionHost();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
