/**
 * Tests for internal/2fa-service.js
 *
 * Covers: TOTP setup/verify, YubiKey OTP validation, Passkey registration/auth,
 * Duo Security, backup codes, and the unified verifyLoginChallenge dispatcher.
 */

import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Shared state ───────────────────────────────────────────────────────────

let fakeUserTwoFaRows = [];
let fakeBackupCodeRows = [];

const matchesFilter = (row, filter) => Object.entries(filter).every(([k, v]) => row[k] === v);

/**
 * Returns a Promise<array> that also exposes Objection-like chainable methods.
 * This mirrors how Objection's QueryBuilder is both thenable and has helpers.
 */
const makeQB = (arr) => {
	const p = Promise.resolve(arr);
	p.findOne = vi.fn((f) => Promise.resolve(arr.find((r) => matchesFilter(r, f)) ?? null));
	p.resultSize = vi.fn(() => Promise.resolve(arr.length));
	p.delete = vi.fn(() => Promise.resolve());
	p.whereNull = vi.fn(() => ({ resultSize: vi.fn(() => Promise.resolve(0)) }));
	p.select = vi.fn(() => Promise.resolve(arr));
	p.patch = vi.fn(() => ({ where: vi.fn(() => Promise.resolve(1)) }));
	return p;
};

// ── Mock: UserTwoFa ─────────────────────────────────────────────────────────

vi.mock("../../models/user-2fa.js", () => ({
	default: {
		query: vi.fn(() => ({
			findOne: vi.fn((filter) =>
				Promise.resolve(fakeUserTwoFaRows.find((r) => matchesFilter(r, filter)) ?? null),
			),
			where: vi.fn((filter) => makeQB(fakeUserTwoFaRows.filter((r) => matchesFilter(r, filter)))),
			whereIn: vi.fn((_col, vals) => ({
				select: vi.fn(() =>
					Promise.resolve(fakeUserTwoFaRows.filter((r) => vals.includes(r.type) && !r.is_deleted)),
				),
			})),
			delete: vi.fn(() => ({
				where: vi.fn((filter) => {
					if (filter) fakeUserTwoFaRows = fakeUserTwoFaRows.filter((r) => !matchesFilter(r, filter));
					else fakeUserTwoFaRows = [];
					return Promise.resolve();
				}),
			})),
			insert: vi.fn((data) => {
				const rows = Array.isArray(data) ? data : [data];
				for (const row of rows) {
					fakeUserTwoFaRows.push({
						id: fakeUserTwoFaRows.length + 1,
						is_verified: 0,
						is_deleted: 0,
						counter: 0,
						...row,
					});
				}
				return Promise.resolve();
			}),
			insertAndFetch: vi.fn((data) => {
				const row = { id: fakeUserTwoFaRows.length + 1, is_verified: 0, is_deleted: 0, counter: 0, ...data };
				fakeUserTwoFaRows.push(row);
				return Promise.resolve(row);
			}),
			patch: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(1)) })),
			resultSize: vi.fn(() => Promise.resolve(fakeUserTwoFaRows.length)),
		})),
		getActiveForUser: vi.fn((userId) =>
			Promise.resolve(
				fakeUserTwoFaRows.filter((r) => r.user_id === userId && r.is_verified === 1 && r.is_deleted === 0),
			),
		),
		hasActive2FA: vi.fn(async (userId) => {
			return fakeUserTwoFaRows.some((r) => r.user_id === userId && r.is_verified === 1 && r.is_deleted === 0);
		}),
	},
}));

// ── Mock: UserTwoFaBackupCode ───────────────────────────────────────────────

vi.mock("../../models/user-2fa-backup-codes.js", () => ({
	default: {
		query: vi.fn(() => ({
			delete: vi.fn(() => ({
				where: vi.fn(() => {
					fakeBackupCodeRows = [];
					return Promise.resolve();
				}),
			})),
			where: vi.fn(() => ({
				whereNull: vi.fn(() => ({ resultSize: vi.fn(() => Promise.resolve(fakeBackupCodeRows.length)) })),
				resultSize: vi.fn(() => Promise.resolve(fakeBackupCodeRows.length)),
			})),
			insert: vi.fn((rows) => {
				if (Array.isArray(rows)) {
					fakeBackupCodeRows.push(...rows);
				} else {
					// Single row object (as passed by regenerateBackupCodes after map)
					fakeBackupCodeRows.push(rows);
				}
				return Promise.resolve();
			}),
		})),
		findAndConsume: vi.fn(async (_userId, _code) => null),
	},
}));

// ── Mock: User model ────────────────────────────────────────────────────────

vi.mock("../../models/user.js", () => ({
	default: {
		query: vi.fn(() => ({
			findById: vi.fn(() => Promise.resolve({ id: 1, name: "Test", email: "test@example.com" })),
		})),
	},
}));

// ── Mock: otplib ────────────────────────────────────────────────────────────

vi.mock("otplib", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		authenticator: {
			generateSecret: vi.fn(() => "JBSWY3DPEHPK3PXP"),
			generateUri: vi.fn(
				(opts) => `otpauth://totp/${opts.issuer}:${opts.label}?secret=${opts.secret}&issuer=${opts.issuer}`,
			),
			verify: vi.fn(() => true),
		},
		generateSecret: vi.fn(() => "JBSWY3DPEHPK3PXP"),
		generateURI: vi.fn(
			(opts) => `otpauth://totp/${opts.issuer}:${opts.label}?secret=${opts.secret}&issuer=${opts.issuer}`,
		),
		verifySync: vi.fn(() => ({ valid: true })),
	};
});

// ── Mock: qrcode ────────────────────────────────────────────────────────────

vi.mock("qrcode", () => ({
	default: {
		toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,fakeqr")),
	},
}));

// ── Mock: @simplewebauthn/server ────────────────────────────────────────────

vi.mock("@simplewebauthn/server", () => ({
	generateRegistrationOptions: vi.fn(() =>
		Promise.resolve({ challenge: "challenge_abc", rp: { id: "localhost", name: "ShieldPM" } }),
	),
	verifyRegistrationResponse: vi.fn(() =>
		Promise.resolve({
			verified: true,
			registrationInfo: {
				credential: { id: "credential_id_1", publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
			},
		}),
	),
	generateAuthenticationOptions: vi.fn(() =>
		Promise.resolve({ challenge: "auth_challenge_xyz", allowCredentials: [] }),
	),
	verifyAuthenticationResponse: vi.fn(() =>
		Promise.resolve({ verified: true, authenticationInfo: { newCounter: 1 } }),
	),
}));

// ── Mock: @duosecurity/duo_universal ────────────────────────────────────────

vi.mock("@duosecurity/duo_universal", () => {
	class Client {
		healthCheck() {
			return Promise.resolve();
		}
		createAuthUrl(_user, state) {
			return Promise.resolve(`https://api.duo.test/authorize?state=${state}`);
		}
		exchangeAuthorizationCodeFor2FAResult() {
			return Promise.resolve({ sub: "testuser" });
		}
	}
	return { Client };
});

// ── Mock: lib/error.js ──────────────────────────────────────────────────────

vi.mock("../../lib/error.js", () => ({
	default: {
		ValidationError: class ValidationError extends Error {
			constructor(m) {
				super(m);
				this.name = "ValidationError";
				this.public = true;
				this.status = 400;
			}
		},
		ItemNotFoundError: class ItemNotFoundError extends Error {
			constructor(m) {
				super(m);
				this.name = "ItemNotFoundError";
				this.public = true;
				this.status = 404;
			}
		},
		InternalError: class InternalError extends Error {
			constructor(m) {
				super(m);
				this.name = "InternalError";
			}
		},
	},
}));

// ── Import SUT ──────────────────────────────────────────────────────────────

const { default: twoFaService } = await import("../../internal/2fa-service.js");

// ── Tests ───────────────────────────────────────────────────────────────────

describe("2fa-service", () => {
	beforeEach(() => {
		fakeUserTwoFaRows = [];
		fakeBackupCodeRows = [];
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// ── TOTP ────────────────────────────────────────────────────────────────

	describe("setupTotp", () => {
		it("returns a QR data URL and otpauth URL", async () => {
			const result = await twoFaService.setupTotp(1, "test@example.com");
			expect(result).toHaveProperty("qrDataUrl");
			expect(result).toHaveProperty("otpauthUrl");
			expect(result).toHaveProperty("secret");
			expect(result.qrDataUrl.startsWith("data:image")).toBe(true);
		});
	});

	describe("verifyAndEnableTotp", () => {
		it("throws ValidationError when no pending TOTP record exists", async () => {
			await expect(twoFaService.verifyAndEnableTotp(99, "123456")).rejects.toMatchObject({
				name: "ValidationError",
			});
		});
	});

	describe("verifyTotp", () => {
		it("returns false when no verified TOTP record exists for the user", async () => {
			const result = await twoFaService.verifyTotp(1, "123456");
			expect(result).toBe(false);
		});
	});

	// ── Backup Codes ────────────────────────────────────────────────────────

	describe("regenerateBackupCodes", () => {
		it("returns 8 unique fixed-length alphanumeric codes", async () => {
			const codes = await twoFaService.regenerateBackupCodes(1);
			expect(codes).toHaveLength(8);
			expect(new Set(codes).size).toBe(8);
			for (const code of codes) {
				expect(code).toMatch(/^[A-Z0-9]{10}$/);
			}
		});

		it("keeps the required length when Base64URL output would include stripped characters", async () => {
			const randomBytes = vi.spyOn(crypto, "randomBytes").mockReturnValue(Buffer.alloc(8, 0xff));

			try {
				const codes = await twoFaService.regenerateBackupCodes(1);
				for (const code of codes) {
					expect(code).toMatch(/^[A-Z0-9]{10}$/);
				}
			} finally {
				randomBytes.mockRestore();
			}
		});
	});

	describe("verifyBackupCode", () => {
		it("returns false for a code that does not exist", async () => {
			const result = await twoFaService.verifyBackupCode(1, "NONEXISTENT");
			expect(result).toBe(false);
		});
	});

	describe("getRemainingBackupCodeCount", () => {
		it("returns 0 when no codes are stored", async () => {
			const count = await twoFaService.getRemainingBackupCodeCount(1);
			expect(count).toBe(0);
		});
	});

	// ── YubiKey ─────────────────────────────────────────────────────────────

	describe("addYubikey", () => {
		it("throws ValidationError when OTP is too short", async () => {
			await expect(twoFaService.addYubikey(1, "short")).rejects.toMatchObject({
				name: "ValidationError",
			});
		});
	});

	// ── verifyLoginChallenge dispatcher ─────────────────────────────────────

	describe("verifyLoginChallenge", () => {
		it("throws ValidationError for unknown method", async () => {
			await expect(twoFaService.verifyLoginChallenge(1, "unknown_method", "code")).rejects.toMatchObject({
				name: "ValidationError",
				message: expect.stringContaining("Unknown 2FA method"),
			});
		});

		it("delegates totp → verifyTotp (returns false when no record)", async () => {
			const result = await twoFaService.verifyLoginChallenge(1, "totp", "123456");
			expect(result).toBe(false);
		});

		it("delegates backup_code → verifyBackupCode (returns false for bad code)", async () => {
			const result = await twoFaService.verifyLoginChallenge(1, "backup_code", "BADCODE");
			expect(result).toBe(false);
		});
	});

	// ── Passkey ─────────────────────────────────────────────────────────────

	describe("beginPasskeyRegistration", () => {
		it("returns WebAuthn options and a challengeId", async () => {
			const result = await twoFaService.beginPasskeyRegistration(1, "test@example.com", {
				headers: { origin: "https://app.shieldpm.local" },
				protocol: "https",
				hostname: "app.shieldpm.local",
			});
			expect(result).toHaveProperty("options");
			expect(result).toHaveProperty("challengeId");
			expect(typeof result.challengeId).toBe("string");
			expect(result.options).toHaveProperty("challenge");
		});
	});

	describe("completePasskeyRegistration", () => {
		it("throws ValidationError when challenge record is not found", async () => {
			await expect(
				twoFaService.completePasskeyRegistration(
					1,
					"invalid-challenge-id",
					{},
					{
						headers: { origin: "https://app.shieldpm.local" },
						protocol: "https",
						hostname: "app.shieldpm.local",
					},
					"My Key",
				),
			).rejects.toMatchObject({
				name: "ValidationError",
				message: expect.stringContaining("not found"),
			});
		});
	});

	describe("beginPasskeyAuthentication", () => {
		it("throws ValidationError when no passkeys are registered", async () => {
			await expect(
				twoFaService.beginPasskeyAuthentication(1, {
					headers: { origin: "https://app.shieldpm.local" },
					protocol: "https",
					hostname: "app.shieldpm.local",
				}),
			).rejects.toMatchObject({
				name: "ValidationError",
				message: expect.stringContaining("No passkeys"),
			});
		});
	});

	// ── Duo Security ────────────────────────────────────────────────────────

	describe("setupDuo", () => {
		it("throws ValidationError when required config fields are missing", async () => {
			await expect(
				twoFaService.setupDuo(1, { clientId: "DI123", clientSecret: "", apiHost: "", redirectUrl: "" }),
			).rejects.toMatchObject({ name: "ValidationError" });
		});

		it("creates a Duo record when all config fields are present", async () => {
			const record = await twoFaService.setupDuo(1, {
				clientId: "DI123456",
				clientSecret: "secret",
				apiHost: "api.duosecurity.com",
				redirectUrl: "https://app.example.com/duo-callback",
			});
			expect(record).toHaveProperty("type", "duo");
			expect(record.is_verified).toBe(1);
		});
	});

	describe("beginDuoAuthentication", () => {
		it("throws ValidationError when Duo is not configured for the user", async () => {
			await expect(twoFaService.beginDuoAuthentication(99, "user@example.com")).rejects.toMatchObject({
				name: "ValidationError",
				message: expect.stringContaining("not configured"),
			});
		});
	});

	// ── removeTwoFaMethod ───────────────────────────────────────────────────

	describe("removeTwoFaMethod", () => {
		it("throws ItemNotFoundError for a non-existent method", async () => {
			await expect(twoFaService.removeTwoFaMethod(1, 9999)).rejects.toMatchObject({
				name: "ItemNotFoundError",
			});
		});
	});
});
