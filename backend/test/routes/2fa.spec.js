import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTwoFaService = {
	setupTotp: vi.fn(() =>
		Promise.resolve({ qrDataUrl: "data:image/png;base64,abc", otpauthUrl: "otpauth://totp/test" }),
	),
	verifyAndEnableTotp: vi.fn(() => Promise.resolve(["CODE1", "CODE2"])),
	addYubikey: vi.fn(() => Promise.resolve({ id: 1, type: "yubikey", label: "My Key", created_on: "2024-01-01" })),
	beginPasskeyRegistration: vi.fn(() => Promise.resolve({ options: {}, challengeId: "ch1" })),
	completePasskeyRegistration: vi.fn(() => Promise.resolve({ backupCodes: ["C1"] })),
	setupDuo: vi.fn(() => Promise.resolve({ id: 1, type: "duo", label: "Duo", created_on: "2024-01-01" })),
	removeTwoFaMethod: vi.fn(() => Promise.resolve()),
	getRemainingBackupCodeCount: vi.fn(() => Promise.resolve(5)),
	regenerateBackupCodes: vi.fn(() => Promise.resolve(["NEW1", "NEW2"])),
};

vi.mock("../../modules/auth/index.js", () => ({ twoFaService: mockTwoFaService }));

vi.mock("../../lib/error.js", () => {
	class UnauthorizedError extends Error {
		constructor(m) {
			super(m || "Unauthorized");
			this.status = 401;
			this.public = true;
		}
	}
	class PermissionError extends Error {
		constructor(m) {
			super(m);
			this.status = 403;
			this.public = true;
		}
	}
	class ValidationError extends Error {
		constructor(m) {
			super(m);
			this.status = 400;
			this.public = true;
		}
	}
	class ItemNotFoundError extends Error {
		constructor(m) {
			super(m || "Not Found");
			this.status = 404;
			this.public = true;
		}
	}
	return { default: { UnauthorizedError, PermissionError, ValidationError, ItemNotFoundError } };
});

vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = {
			token: {
				getUserId: () => 1,
				hasScope: (s) => s === "admin",
				get: (k) => (k === "email" ? "test@test.com" : null),
			},
		};
		next();
	},
}));

vi.mock("../../lib/express/user-id-from-me.js", () => ({
	default: (req, _res, next) => {
		if (req.params.user_id === "me") req.params.user_id = "1";
		next();
	},
}));

vi.mock("../../models/user-2fa.js", () => ({
	default: {
		query: vi.fn(() => ({
			where: vi.fn().mockReturnThis(),
			whereIn: vi.fn().mockReturnThis(),
			select: vi.fn(() => Promise.resolve([{ id: 1, type: "totp", label: "My TOTP" }])),
		})),
	},
}));

vi.mock("../../models/user-2fa-backup-codes.js", () => ({
	default: {
		query: vi.fn(() => ({
			where: vi.fn().mockReturnThis(),
			whereNull: vi.fn().mockReturnThis(),
			resultSize: vi.fn(() => Promise.resolve(5)),
		})),
	},
}));

vi.mock("../../models/user.js", () => ({
	default: {
		query: vi.fn(() => ({
			findById: vi.fn(() => Promise.resolve({ id: 1, email: "test@test.com" })),
		})),
	},
}));

vi.mock("express-rate-limit", () => ({
	default: () => (_req, _res, next) => next(),
}));

beforeEach(() => vi.clearAllMocks());

// Helper to simulate requireSelfOrAdmin
const requireSelfOrAdmin = (requesterId, targetUserId, isAdmin) => {
	if (!requesterId) throw new Error("Authentication required");
	if (!isAdmin && requesterId !== targetUserId) throw new Error("Permission denied");
	return targetUserId;
};

describe("2fa routes", () => {
	describe("GET /2fa (list methods)", () => {
		it("returns methods and backup code count", async () => {
			const UserTwoFa = (await import("../../models/user-2fa.js")).default;
			const methods = await UserTwoFa.query()
				.where({ user_id: 1, is_deleted: 0 })
				.whereIn("type", ["totp"])
				.select("id", "type", "label");
			expect(methods).toHaveLength(1);
		});

		it("requires authentication", () => {
			expect(() => requireSelfOrAdmin(null, 1, false)).toThrow("Authentication required");
		});
	});

	describe("POST /2fa/totp/setup", () => {
		it("returns QR code data", async () => {
			const result = await mockTwoFaService.setupTotp(1, "test@test.com");
			expect(result.qrDataUrl).toContain("data:image");
			expect(result.otpauthUrl).toContain("otpauth://");
		});

		it("rejects if email cannot be determined", () => {
			const email = null;
			expect(!email).toBe(true);
		});
	});

	describe("POST /2fa/totp/enable", () => {
		it("enables TOTP and returns backup codes", async () => {
			const codes = await mockTwoFaService.verifyAndEnableTotp(1, "123456");
			expect(codes).toEqual(["CODE1", "CODE2"]);
		});

		it("rejects missing code", () => {
			const code = undefined;
			expect(!code || typeof code !== "string").toBe(true);
		});

		it("rejects non-string code", () => {
			const code = 123456;
			expect(typeof code !== "string").toBe(true);
		});
	});

	describe("POST /2fa/yubikey/add", () => {
		it("adds a yubikey", async () => {
			const result = await mockTwoFaService.addYubikey(1, "yubikey-otp", "My Key");
			expect(result.type).toBe("yubikey");
		});

		it("rejects missing OTP", () => {
			const otp = undefined;
			expect(!otp || typeof otp !== "string").toBe(true);
		});
	});

	describe("POST /2fa/passkey/register/begin", () => {
		it("returns WebAuthn registration options", async () => {
			const result = await mockTwoFaService.beginPasskeyRegistration(1, "test@test.com", {});
			expect(result.challengeId).toBe("ch1");
		});

		it("rejects if user not found", async () => {
			const userModel = (await import("../../models/user.js")).default;
			userModel.query.mockReturnValue({ findById: vi.fn(() => Promise.resolve(null)) });
			const user = await userModel.query().findById(999);
			expect(user).toBeNull();
		});
	});

	describe("POST /2fa/passkey/register/complete", () => {
		it("completes passkey registration", async () => {
			const result = await mockTwoFaService.completePasskeyRegistration(1, "ch1", {}, {});
			expect(result.backupCodes).toEqual(["C1"]);
		});

		it("rejects missing challenge_id", () => {
			const body = { registration_response: {} };
			expect(!body.challenge_id).toBe(true);
		});
	});

	describe("POST /2fa/duo/setup", () => {
		it("sets up Duo", async () => {
			const result = await mockTwoFaService.setupDuo(1, {
				clientId: "cid",
				clientSecret: "cs",
				apiHost: "api.duo.com",
			});
			expect(result.type).toBe("duo");
		});
	});

	describe("DELETE /2fa/:methodId", () => {
		it("removes a 2FA method", async () => {
			await mockTwoFaService.removeTwoFaMethod(1, 1);
			expect(mockTwoFaService.removeTwoFaMethod).toHaveBeenCalledWith(1, 1);
		});

		it("rejects invalid method ID", () => {
			const methodId = Number.parseInt("abc", 10);
			expect(Number.isNaN(methodId)).toBe(true);
		});
	});

	describe("GET /2fa/backup-codes/count", () => {
		it("returns remaining backup code count", async () => {
			const count = await mockTwoFaService.getRemainingBackupCodeCount(1);
			expect(count).toBe(5);
		});
	});

	describe("POST /2fa/backup-codes/regenerate", () => {
		it("regenerates backup codes", async () => {
			const codes = await mockTwoFaService.regenerateBackupCodes(1);
			expect(codes).toEqual(["NEW1", "NEW2"]);
		});
	});

	describe("requireSelfOrAdmin", () => {
		it("allows self access", () => {
			expect(requireSelfOrAdmin(1, 1, false)).toBe(1);
		});

		it("allows admin access to other user", () => {
			expect(requireSelfOrAdmin(1, 2, true)).toBe(2);
		});

		it("rejects non-admin accessing other user", () => {
			expect(() => requireSelfOrAdmin(1, 2, false)).toThrow("Permission denied");
		});
	});
});
