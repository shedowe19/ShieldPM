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

const { default: Certificate } = await import("../../models/certificate.js");

describe("Certificate model", () => {
	it("has correct tableName", () => {
		expect(Certificate.tableName).toBe("certificate");
	});

	it("has correct static name", () => {
		expect(Certificate.name).toBe("Certificate");
	});

	it("has jsonAttributes including domain_names and meta", () => {
		expect(Certificate.jsonAttributes).toContain("domain_names");
		expect(Certificate.jsonAttributes).toContain("meta");
	});

	it("defines owner, proxy_hosts, dead_hosts, redirection_hosts, streams relations", () => {
		const relations = Certificate.relationMappings;
		expect(relations).toHaveProperty("owner");
		expect(relations).toHaveProperty("proxy_hosts");
		expect(relations).toHaveProperty("dead_hosts");
		expect(relations).toHaveProperty("redirection_hosts");
		expect(relations).toHaveProperty("streams");
		expect(relations.owner.join.from).toBe("certificate.owner_user_id");
		expect(relations.proxy_hosts.join.from).toBe("certificate.id");
	});

	it("$beforeInsert sets defaults for meta, domain_names, expires_on", () => {
		const instance = new Certificate();
		instance.$beforeInsert();
		expect(instance.meta).toEqual({});
		expect(instance.domain_names).toEqual([]);
		expect(instance.expires_on).toBeDefined();
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
	});

	it("$beforeInsert does not override existing domain_names", () => {
		const instance = new Certificate();
		instance.domain_names = ["example.com"];
		instance.$beforeInsert();
		expect(instance.domain_names).toEqual(["example.com"]);
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new Certificate();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
