import { describe, expect, it, vi } from "vitest";

// Mock db before model imports
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

const { default: AccessList } = await import("../../models/access_list.js");
const { default: AccessListAuth } = await import("../../models/access_list_auth.js");
const { default: AccessListClient } = await import("../../models/access_list_client.js");

describe("AccessList model", () => {
	it("has correct tableName", () => {
		expect(AccessList.tableName).toBe("access_list");
	});

	it("has correct static name", () => {
		expect(AccessList.name).toBe("AccessList");
	});

	it("has jsonAttributes including meta", () => {
		expect(AccessList.jsonAttributes).toContain("meta");
	});

	it("defines owner relation", () => {
		const relations = AccessList.relationMappings;
		expect(relations).toHaveProperty("owner");
		expect(relations.owner.join.from).toBe("access_list.owner_user_id");
		expect(relations.owner.join.to).toBe("user.id");
	});

	it("defines items relation (HasMany to AccessListAuth)", () => {
		const relations = AccessList.relationMappings;
		expect(relations).toHaveProperty("items");
		expect(relations.items.join.from).toBe("access_list.id");
		expect(relations.items.join.to).toBe("access_list_auth.access_list_id");
	});

	it("defines clients relation (HasMany to AccessListClient)", () => {
		const relations = AccessList.relationMappings;
		expect(relations).toHaveProperty("clients");
		expect(relations.clients.join.from).toBe("access_list.id");
		expect(relations.clients.join.to).toBe("access_list_client.access_list_id");
	});

	it("defines proxy_hosts relation", () => {
		const relations = AccessList.relationMappings;
		expect(relations).toHaveProperty("proxy_hosts");
		expect(relations.proxy_hosts.join.from).toBe("access_list.id");
		expect(relations.proxy_hosts.join.to).toBe("proxy_host.access_list_id");
	});

	it("$beforeInsert sets defaults", () => {
		const instance = new AccessList();
		instance.$beforeInsert();
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
	});
});

describe("AccessListAuth model", () => {
	it("has correct tableName", () => {
		expect(AccessListAuth.tableName).toBe("access_list_auth");
	});

	it("has correct static name", () => {
		expect(AccessListAuth.name).toBe("AccessListAuth");
	});

	it("has jsonAttributes including meta", () => {
		expect(AccessListAuth.jsonAttributes).toContain("meta");
	});

	it("defines access_list relation", () => {
		const relations = AccessListAuth.relationMappings;
		expect(relations).toHaveProperty("access_list");
		expect(relations.access_list.join.from).toBe("access_list_auth.access_list_id");
		expect(relations.access_list.join.to).toBe("access_list.id");
	});

	it("$beforeInsert sets defaults", () => {
		const instance = new AccessListAuth();
		instance.$beforeInsert();
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
	});
});

describe("AccessListClient model", () => {
	it("has correct tableName", () => {
		expect(AccessListClient.tableName).toBe("access_list_client");
	});

	it("has correct static name", () => {
		expect(AccessListClient.name).toBe("AccessListClient");
	});

	it("has jsonAttributes including meta", () => {
		expect(AccessListClient.jsonAttributes).toContain("meta");
	});

	it("defines access_list relation", () => {
		const relations = AccessListClient.relationMappings;
		expect(relations).toHaveProperty("access_list");
		expect(relations.access_list.join.from).toBe("access_list_client.access_list_id");
		expect(relations.access_list.join.to).toBe("access_list.id");
	});

	it("$beforeInsert sets defaults", () => {
		const instance = new AccessListClient();
		instance.$beforeInsert();
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
	});
});
