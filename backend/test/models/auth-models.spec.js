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

const { default: Auth } = await import("../../models/auth.js");
const { default: AuthSession } = await import("../../models/auth-session.js");

describe("Auth model", () => {
	it("has correct tableName", () => {
		expect(Auth.tableName).toBe("auth");
	});

	it("has correct static name", () => {
		expect(Auth.name).toBe("Auth");
	});

	it("has jsonAttributes including meta", () => {
		expect(Auth.jsonAttributes).toContain("meta");
	});

	it("defines user relation with filter", () => {
		const relations = Auth.relationMappings;
		expect(relations).toHaveProperty("user");
		expect(relations.user.join.from).toBe("auth.user_id");
		expect(relations.user.join.to).toBe("user.id");
		expect(relations.user.filter).toEqual({ is_deleted: 0 });
	});

	it("has verifyPassword instance method", () => {
		const instance = new Auth();
		expect(typeof instance.verifyPassword).toBe("function");
	});

	it("$beforeInsert sets defaults", async () => {
		const instance = new Auth();
		instance.type = "something";
		await instance.$beforeInsert({});
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
		expect(instance.meta).toEqual({});
	});
});

describe("AuthSession model", () => {
	it("has correct tableName", () => {
		expect(AuthSession.tableName).toBe("auth_sessions");
	});

	it("has correct static name", () => {
		expect(AuthSession.name).toBe("AuthSession");
	});

	it("has jsonAttributes including scope", () => {
		expect(AuthSession.jsonAttributes).toContain("scope");
	});

	it("defines user, parentSession, and replacedBySession relations", () => {
		const relations = AuthSession.relationMappings;
		expect(relations).toHaveProperty("user");
		expect(relations).toHaveProperty("parentSession");
		expect(relations).toHaveProperty("replacedBySession");
		expect(relations.user.join.from).toBe("auth_sessions.user_id");
		expect(relations.parentSession.join.from).toBe("auth_sessions.parent_session_id");
		expect(relations.replacedBySession.join.from).toBe("auth_sessions.replaced_by_session_id");
	});

	it("normalizeScope converts string to array", () => {
		expect(AuthSession.normalizeScope("user")).toEqual(["user"]);
		expect(AuthSession.normalizeScope(["admin"])).toEqual(["admin"]);
		expect(AuthSession.normalizeScope("")).toEqual([]);
		expect(AuthSession.normalizeScope(undefined)).toEqual([]);
	});

	it("hashToken returns a string hash", () => {
		const hash = AuthSession.hashToken("test-token");
		expect(typeof hash).toBe("string");
		expect(hash.length).toBeGreaterThan(0);
	});

	it("createFamilyId returns a UUID-like string", () => {
		const id = AuthSession.createFamilyId();
		expect(typeof id).toBe("string");
		expect(id).toMatch(/^[0-9a-f-]+$/);
	});

	it("createJti returns a hex string", () => {
		const jti = AuthSession.createJti();
		expect(typeof jti).toBe("string");
		expect(jti.length).toBeGreaterThan(0);
	});

	it("buildLookup returns object with token_hash", () => {
		const lookup = AuthSession.buildLookup("my-raw-token");
		expect(lookup).toHaveProperty("token_hash");
		expect(typeof lookup.token_hash).toBe("string");
	});

	it("$beforeInsert sets family_id, jti, and normalizes scope", () => {
		const instance = new AuthSession();
		instance.scope = "user";
		instance.$beforeInsert();
		expect(instance.family_id).toBeDefined();
		expect(instance.jti).toBeDefined();
		expect(instance.scope).toEqual(["user"]);
	});
});
