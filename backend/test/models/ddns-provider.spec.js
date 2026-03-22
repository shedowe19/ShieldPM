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

const { default: DdnsProvider } = await import("../../models/ddns_provider.js");

describe("DdnsProvider model", () => {
	it("has correct tableName", () => {
		expect(DdnsProvider.tableName).toBe("ddns_provider");
	});

	it("has correct static name", () => {
		expect(DdnsProvider.name).toBe("DdnsProvider");
	});

	it("has jsonAttributes including domains, config, meta", () => {
		expect(DdnsProvider.jsonAttributes).toContain("domains");
		expect(DdnsProvider.jsonAttributes).toContain("config");
		expect(DdnsProvider.jsonAttributes).toContain("meta");
	});

	it("defines owner relation", () => {
		const relations = DdnsProvider.relationMappings;
		expect(relations).toHaveProperty("owner");
		expect(relations.owner.join.from).toBe("ddns_provider.owner_user_id");
		expect(relations.owner.join.to).toBe("user.id");
	});

	it("$beforeInsert sets defaults for domains, config, meta", () => {
		const instance = new DdnsProvider();
		instance.$beforeInsert();
		expect(instance.domains).toEqual([]);
		expect(instance.config).toEqual({});
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
	});

	it("$beforeInsert does not override existing domains", () => {
		const instance = new DdnsProvider();
		instance.domains = ["example.com"];
		instance.$beforeInsert();
		expect(instance.domains).toEqual(["example.com"]);
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new DdnsProvider();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
