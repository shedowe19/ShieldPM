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

const { default: HostDomain } = await import("../../models/host_domain.js");

describe("HostDomain model", () => {
	it("has correct tableName", () => {
		expect(HostDomain.tableName).toBe("host_domain");
	});

	it("has correct static name", () => {
		expect(HostDomain.name).toBe("HostDomain");
	});

	it("defines proxy_host relation", () => {
		const relations = HostDomain.relationMappings;
		expect(relations).toHaveProperty("proxy_host");
		expect(relations.proxy_host.join.from).toBe("host_domain.proxy_host_id");
		expect(relations.proxy_host.join.to).toBe("proxy_host.id");
	});

	it("$beforeInsert sets created_on and modified_on", () => {
		const instance = new HostDomain();
		instance.$beforeInsert();
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new HostDomain();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
