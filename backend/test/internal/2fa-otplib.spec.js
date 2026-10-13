import { generateSync } from "otplib";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.db };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, getEncryptionKey: () => "01".repeat(32) }));

import service from "../../internal/2fa-service.js";

// RFC 6238's SHA-1 secret and 59-second vector, reduced to the six login digits.
const vectorSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("installed otplib compatibility with the real 2FA service", () => {
	beforeAll(async () => {
		await state.db.schema.createTable("user_2fa", (table) => {
			table.increments("id");
			table.integer("user_id");
			for (const field of ["type", "secret", "label", "created_on", "modified_on", "meta"]) table.text(field);
			table.integer("counter").defaultTo(0);
			table.integer("is_verified").defaultTo(0);
			table.integer("is_deleted").defaultTo(0);
		});
		await state.db.schema.createTable("user_2fa_backup_codes", (table) => {
			table.increments("id");
			table.integer("user_id");
			table.string("code_hash");
			table.string("created_on");
			table.string("used_at");
		});
	});
	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-13T12:00:01Z"));
		await state.db("user_2fa_backup_codes").delete();
		await state.db("user_2fa").delete();
	});
	afterEach(() => vi.useRealTimers());
	afterAll(async () => state.db.destroy());

	it("creates a usable secret, encoded URI and PNG QR through the actual package exports", async () => {
		const setup = await service.setupTotp(7, "first+totp@example.test");
		expect(setup.secret).toMatch(/^[A-Z2-7]{16,}$/);
		const uri = new URL(setup.otpauthUrl);
		expect(uri.protocol).toBe("otpauth:");
		expect(uri.hostname).toBe("totp");
		expect(decodeURIComponent(uri.pathname)).toContain("first+totp@example.test");
		expect(uri.searchParams.get("secret")).toBe(setup.secret);
		expect(uri.searchParams.get("issuer")).toBe("ShieldPM");
		// otplib omits the standard SHA1 / six-digit / 30-second URI defaults.
		expect(uri.searchParams.get("algorithm") ?? "SHA1").toBe("SHA1");
		expect(uri.searchParams.get("digits") ?? "6").toBe("6");
		expect(uri.searchParams.get("period") ?? "30").toBe("30");
		const png = Buffer.from(setup.qrDataUrl.split(",")[1], "base64");
		expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
		expect(await state.db("user_2fa").where({ user_id: 7 }).first()).toMatchObject({
			secret: setup.secret,
			is_verified: 0,
		});
	});

	it("rejects an invalid enrollment before enabling it or issuing recovery codes", async () => {
		await state.db("user_2fa").insert({ user_id: 7, type: "totp", secret: vectorSecret, is_verified: 0 });
		vi.setSystemTime(59_000);
		await expect(service.verifyAndEnableTotp(7, "000000")).rejects.toMatchObject({
			name: "ValidationError",
			message: "Invalid TOTP code",
		});
		expect((await state.db("user_2fa").first()).is_verified).toBe(0);
		expect(await state.db("user_2fa_backup_codes")).toHaveLength(0);
	});

	it("enables an actual generated code, then consumes that login time step once", async () => {
		const setup = await service.setupTotp(7, "first@example.test");
		const code = generateSync({ secret: setup.secret });
		expect(await service.verifyTotp(7, code)).toBe(false);
		const backupCodes = await service.verifyAndEnableTotp(7, code);
		expect(backupCodes).toHaveLength(8);
		expect(await state.db("user_2fa_backup_codes").where({ user_id: 7 })).toHaveLength(8);
		expect(await service.verifyTotp(7, code)).toBe(true);
		expect(await service.verifyTotp(7, code)).toBe(false);
	});

	it("accepts the independent RFC 6238 SHA-1 vector and persists its counter", async () => {
		vi.setSystemTime(59_000);
		await state.db("user_2fa").insert({ user_id: 7, type: "totp", secret: vectorSecret, is_verified: 1 });
		expect(await service.verifyTotp(7, "287082")).toBe(true);
		expect((await state.db("user_2fa").where({ user_id: 7 }).first()).counter).toBe(1);
		expect(await service.verifyTotp(7, "287082")).toBe(false);
	});
});
