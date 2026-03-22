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

const { default: User } = await import("../../models/user.js");
const { default: UserPermission } = await import("../../models/user_permission.js");
const { default: UserTwoFa } = await import("../../models/user-2fa.js");
const { default: UserTwoFaBackupCode } = await import("../../models/user-2fa-backup-codes.js");

describe("User model", () => {
	it("has correct tableName", () => {
		expect(User.tableName).toBe("user");
	});

	it("has correct static name", () => {
		expect(User.name).toBe("User");
	});

	it("has jsonAttributes including roles", () => {
		expect(User.jsonAttributes).toContain("roles");
	});

	it("defines permissions relation", () => {
		const relations = User.relationMappings;
		expect(relations).toHaveProperty("permissions");
		expect(relations.permissions.join.from).toBe("user.id");
		expect(relations.permissions.join.to).toBe("user_permission.user_id");
	});

	it("$beforeInsert sets defaults for roles", () => {
		const instance = new User();
		instance.$beforeInsert();
		expect(instance.roles).toEqual([]);
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new User();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});

describe("UserPermission model", () => {
	it("has correct tableName", () => {
		expect(UserPermission.tableName).toBe("user_permission");
	});

	it("has correct static name", () => {
		expect(UserPermission.name).toBe("UserPermission");
	});

	it("$beforeInsert sets created_on and modified_on", () => {
		const instance = new UserPermission();
		instance.$beforeInsert();
		expect(instance.created_on).toBeDefined();
		expect(instance.modified_on).toBeDefined();
	});

	it("$beforeUpdate sets modified_on", () => {
		const instance = new UserPermission();
		instance.$beforeUpdate();
		expect(instance.modified_on).toBeDefined();
	});
});

describe("UserTwoFa model", () => {
	it("has correct tableName", () => {
		expect(UserTwoFa.tableName).toBe("user_2fa");
	});

	it("has correct static name", () => {
		expect(UserTwoFa.name).toBe("UserTwoFa");
	});

	it("has jsonAttributes including meta", () => {
		expect(UserTwoFa.jsonAttributes).toContain("meta");
	});

	it("defines user relation", () => {
		const relations = UserTwoFa.relationMappings;
		expect(relations).toHaveProperty("user");
		expect(relations.user.join.from).toBe("user_2fa.user_id");
		expect(relations.user.join.to).toBe("user.id");
	});

	it("$beforeInsert sets defaults", () => {
		const instance = new UserTwoFa();
		instance.$beforeInsert();
		expect(instance.meta).toEqual({});
		expect(instance.created_on).toBeDefined();
	});

	it("has static getActiveForUser method", () => {
		expect(typeof UserTwoFa.getActiveForUser).toBe("function");
	});

	it("has static hasActive2FA method", () => {
		expect(typeof UserTwoFa.hasActive2FA).toBe("function");
	});
});

describe("UserTwoFaBackupCode model", () => {
	it("has correct tableName", () => {
		expect(UserTwoFaBackupCode.tableName).toBe("user_2fa_backup_codes");
	});

	it("has correct static name", () => {
		expect(UserTwoFaBackupCode.name).toBe("UserTwoFaBackupCode");
	});

	it("$beforeInsert sets created_on", () => {
		const instance = new UserTwoFaBackupCode();
		instance.$beforeInsert();
		expect(instance.created_on).toBeDefined();
	});

	it("has static findAndConsume method", () => {
		expect(typeof UserTwoFaBackupCode.findAndConsume).toBe("function");
	});
});
