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

const { default: CloudflaredTunnel } = await import("../../models/cloudflared_tunnel.js");

describe("CloudflaredTunnel model", () => {
	it("has correct tableName", () => {
		expect(CloudflaredTunnel.tableName).toBe("cloudflared_tunnel");
	});

	it("has correct static name", () => {
		expect(CloudflaredTunnel.name).toBe("CloudflaredTunnel");
	});

	it("has jsonAttributes including meta", () => {
		expect(CloudflaredTunnel.jsonAttributes).toContain("meta");
	});

	it("defines owner relation", () => {
		const relations = CloudflaredTunnel.relationMappings;
		expect(relations).toHaveProperty("owner");
		expect(relations.owner.join.from).toBe("cloudflared_tunnel.owner_user_id");
		expect(relations.owner.join.to).toBe("user.id");
	});

	it("$beforeInsert sets defaults", () => {
		const instance = new CloudflaredTunnel();
		instance.$beforeInsert();
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new CloudflaredTunnel();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});
