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

const { default: ProxyHost } = await import("../../models/proxy_host.js");

describe("ProxyHost model", () => {
	it("has correct tableName", () => {
		expect(ProxyHost.tableName).toBe("proxy_host");
	});

	it("has correct static name", () => {
		expect(ProxyHost.name).toBe("ProxyHost");
	});

	it("has jsonAttributes including domain_names, meta, locations, anubis_rules", () => {
		const attrs = ProxyHost.jsonAttributes;
		expect(attrs).toContain("domain_names");
		expect(attrs).toContain("meta");
		expect(attrs).toContain("locations");
		expect(attrs).toContain("anubis_rules");
	});

	it("defines owner, access_list, certificate, tor_onion, host_domains relations", () => {
		const relations = ProxyHost.relationMappings;
		expect(relations).toHaveProperty("owner");
		expect(relations).toHaveProperty("access_list");
		expect(relations).toHaveProperty("certificate");
		expect(relations).toHaveProperty("tor_onion");
		expect(relations).toHaveProperty("host_domains");
		expect(relations.owner.join.from).toBe("proxy_host.owner_user_id");
		expect(relations.access_list.join.from).toBe("proxy_host.access_list_id");
		expect(relations.certificate.join.from).toBe("proxy_host.certificate_id");
	});

	it("$beforeInsert sets defaults for domain_names and meta", () => {
		const instance = new ProxyHost();
		instance.$beforeInsert();
		expect(instance.domain_names).toEqual([]);
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
		expect(instance.maintenance_start).toBeNull();
		expect(instance.maintenance_end).toBeNull();
	});

	it("$afterGet maps host_domains to domain_names", () => {
		const instance = new ProxyHost();
		instance.host_domains = [{ domain_name: "a.com" }, { domain_name: "b.com" }];
		instance.$afterGet();
		expect(instance.domain_names).toEqual(["a.com", "b.com"]);
	});

	it("$afterGet defaults domain_names to [] if no host_domains", () => {
		const instance = new ProxyHost();
		instance.$afterGet();
		expect(instance.domain_names).toEqual([]);
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new ProxyHost();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
