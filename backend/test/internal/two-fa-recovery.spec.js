import bcrypt from "bcryptjs";
import { generateSync } from "otplib";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, getEncryptionKey: () => "01".repeat(32) }));

import service from "../../internal/2fa-service.js";

const firstSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const secondSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("multiple TOTP methods and recovery-code persistence", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("user_2fa", (t) => {
			t.increments("id");
			t.integer("user_id");
			t.string("type");
			t.string("secret");
			t.integer("counter").defaultTo(0);
			t.text("meta");
			t.integer("is_verified");
			t.integer("is_deleted").defaultTo(0);
			t.string("modified_on");
		});
		await state.db.schema.createTable("user_2fa_backup_codes", (t) => {
			t.increments("id");
			t.integer("user_id");
			t.string("code_hash");
			t.string("created_on");
			t.string("used_at");
		});
	});
	beforeEach(async () => {
		await state.db.raw("DROP TRIGGER IF EXISTS reject_backup");
		await state.db("user_2fa").delete();
		await state.db("user_2fa_backup_codes").delete();
		await state.db("user_2fa").insert([
			{ id: 1, user_id: 7, type: "totp", secret: firstSecret, is_verified: 1 },
			{ id: 2, user_id: 7, type: "totp", secret: secondSecret, is_verified: 0 },
		]);
		await state.db("user_2fa_backup_codes").insert([
			{ user_id: 7, code_hash: "previous-recovery" },
			{ user_id: 8, code_hash: "other-user" },
		]);
	});
	afterAll(async () => state.db.destroy());

	it("accepts every enabled authenticator while rejecting pending or deleted methods", async () => {
		const code = generateSync({ secret: secondSecret });
		await state.db("user_2fa").where({ id: 1 }).update({ secret: firstSecret });
		expect(await service.verifyTotp(7, code)).toBe(false);
		await state.db("user_2fa").where({ id: 2 }).update({ is_verified: 1 });
		expect(await service.verifyTotp(7, code)).toBe(true);
		await state.db("user_2fa").where({ id: 2 }).update({ is_deleted: 1 });
		expect(await service.verifyTotp(7, code)).toBe(false);
	});

	it("preserves backup codes when deleting an unverified method", async () => {
		await service.removeTwoFaMethod(7, 2);
		expect(await state.db("user_2fa_backup_codes").where({ user_id: 7 })).toHaveLength(1);
	});

	it("consumes an authenticator time step once, including concurrent login attempts", async () => {
		const code = generateSync({ secret: firstSecret });
		const results = await Promise.all([service.verifyTotp(7, code), service.verifyTotp(7, code)]);
		expect(results.sort()).toEqual([false, true]);
		expect(await service.verifyTotp(7, code)).toBe(false);
		const row = await state.db("user_2fa").where({ id: 1 }).first();
		expect(row.counter).toBeGreaterThan(0);
	});

	it("deletes only that user's backup codes when the final enabled method is removed", async () => {
		await service.removeTwoFaMethod(7, 1);
		expect(await state.db("user_2fa_backup_codes").where({ user_id: 7 })).toHaveLength(0);
		expect(await state.db("user_2fa_backup_codes").where({ user_id: 8 })).toHaveLength(1);
	});

	it("preserves all previous codes when any replacement insert fails", async () => {
		await state.db.raw(
			"CREATE TRIGGER reject_backup BEFORE INSERT ON user_2fa_backup_codes WHEN (SELECT count(*) FROM user_2fa_backup_codes WHERE user_id=7) >= 2 BEGIN SELECT RAISE(ABORT, 'backup insert failed'); END",
		);
		await expect(service.regenerateBackupCodes(7)).rejects.toThrow("backup insert failed");
		expect((await state.db("user_2fa_backup_codes").where({ user_id: 7 })).map((row) => row.code_hash)).toEqual([
			"previous-recovery",
		]);
	});

	it("commits a complete set and recovery codes remain single use", async () => {
		const codes = await service.regenerateBackupCodes(7);
		const rows = await state.db("user_2fa_backup_codes").where({ user_id: 7 });
		expect(rows).toHaveLength(8);
		expect(await bcrypt.compare(codes[0], rows[0].code_hash)).toBe(true);
		expect(await service.verifyBackupCode(7, codes[0])).toBe(true);
		expect(await service.verifyBackupCode(7, codes[0])).toBe(false);
		expect(await state.db("user_2fa_backup_codes").where({ user_id: 8 })).toHaveLength(1);
	});
});
