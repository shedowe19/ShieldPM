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

const { default: TorOnion } = await import("../../models/tor_onion.js");

describe("TorOnion model", () => {
	it("has correct tableName", () => {
		expect(TorOnion.tableName).toBe("tor_onion");
	});

	it("has correct static name", () => {
		expect(TorOnion.name).toBe("TorOnion");
	});

	it("has jsonAttributes including meta", () => {
		expect(TorOnion.jsonAttributes).toContain("meta");
	});

	it("defines owner and proxy_host relations", () => {
		const relations = TorOnion.relationMappings;
		expect(relations).toHaveProperty("owner");
		expect(relations).toHaveProperty("proxy_host");
		expect(relations.owner.join.from).toBe("tor_onion.owner_user_id");
		expect(relations.proxy_host.join.from).toBe("tor_onion.proxy_host_id");
		expect(relations.proxy_host.join.to).toBe("proxy_host.id");
	});

	it("$beforeInsert sets defaults", () => {
		const instance = new TorOnion();
		instance.$beforeInsert();
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new TorOnion();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
