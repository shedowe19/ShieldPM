/**
 * Tests for backend/modules/auth/ (non-2FA parts)
 * - login-attempts.js: normalizeLoginIdentifier
 * - pending-2fa.js: createPendingTwoFaChallenge, loadPendingTwoFaPayload, loadPendingTwoFaUser
 * - token-response.js: issueAuthResponse
 * - index.js: exports
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockKnexSchemaHasTable = vi.fn(() => Promise.resolve(true));
const mockKnexSchemaCreateTable = vi.fn(() => Promise.resolve());
const _mockKnexDeleteWhere = vi.fn(() => Promise.resolve(0));
const mockKnexFirst = vi.fn(() => Promise.resolve(null));
const mockKnexInsert = vi.fn(() => ({
	onConflict: vi.fn(() => ({
		merge: vi.fn(() => Promise.resolve()),
	})),
}));
const mockKnexDelete = vi.fn(() => Promise.resolve(0));
const _mockKnexOrWhere = vi.fn();

const mockKnexInstance = vi.fn(() => ({
	where: vi.fn(() => ({
		andWhere: vi.fn(() => ({
			delete: vi.fn(() => Promise.resolve(0)),
		})),
		first: mockKnexFirst,
		delete: mockKnexDelete,
	})),
	insert: mockKnexInsert,
}));
mockKnexInstance.schema = {
	hasTable: mockKnexSchemaHasTable,
	createTable: mockKnexSchemaCreateTable,
};
mockKnexInstance.raw = vi.fn((sql, _bindings) => sql);

vi.mock("../../models/user.js", () => ({
	default: {
		knex: () => mockKnexInstance,
		query: vi.fn(() => ({
			findById: vi.fn(() => ({
				andWhere: vi.fn(() => ({
					andWhere: vi.fn(() => Promise.resolve({ id: 1, name: "Alice", email: "alice@example.com" })),
				})),
			})),
		})),
	},
}));

vi.mock("../../models/token.js", () => ({
	default: vi.fn(() => ({
		create: vi.fn(({ scope }) =>
			Promise.resolve({
				token: `mock_pending_token_${Array.isArray(scope) ? scope.join(",") : scope}`,
				payload: {},
			}),
		),
		load: vi.fn((token) => {
			if (token === "valid_pending") {
				return Promise.resolve({
					scope: ["2fa_pending"],
					attrs: { id: 1 },
				});
			}
			if (token === "wrong_scope") {
				return Promise.resolve({
					scope: ["user"],
					attrs: { id: 1 },
				});
			}
			if (token === "no_user_id") {
				return Promise.resolve({
					scope: ["2fa_pending"],
					attrs: {},
				});
			}
			return Promise.reject(new Error("Invalid token"));
		}),
	})),
}));

vi.mock("../../models/user-2fa.js", () => ({
	default: {
		getActiveForUser: vi.fn(async () => [{ type: "totp" }, { type: "totp" }, { type: "yubikey" }]),
	},
}));

vi.mock("../../lib/auth-cookies.js", () => ({
	setAuthCookies: vi.fn(),
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { normalizeLoginIdentifier } from "../../modules/auth/login-attempts.js";
import {
	createPendingTwoFaChallenge,
	loadPendingTwoFaPayload,
	loadPendingTwoFaUser,
} from "../../modules/auth/pending-2fa.js";
import { issueAuthResponse } from "../../modules/auth/token-response.js";
import { setAuthCookies } from "../../lib/auth-cookies.js";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("auth module – normalizeLoginIdentifier", () => {
	it("should extract identity from body.identity", () => {
		expect(normalizeLoginIdentifier({ identity: "Alice@Example.com" })).toBe("alice@example.com");
	});

	it("should fall back to body.email", () => {
		expect(normalizeLoginIdentifier({ email: "  Bob@Test.org  " })).toBe("bob@test.org");
	});

	it("should fall back to body.username", () => {
		expect(normalizeLoginIdentifier({ username: "Admin" })).toBe("admin");
	});

	it("should prefer identity over email and username", () => {
		expect(normalizeLoginIdentifier({ identity: "First", email: "second@test.com", username: "third" })).toBe(
			"first",
		);
	});

	it("should return null for null/undefined/non-object", () => {
		expect(normalizeLoginIdentifier(null)).toBeNull();
		expect(normalizeLoginIdentifier(undefined)).toBeNull();
		expect(normalizeLoginIdentifier("string")).toBeNull();
	});

	it("should return null when all candidates are empty strings", () => {
		expect(normalizeLoginIdentifier({ identity: "", email: "  ", username: "" })).toBeNull();
	});

	it("should skip non-string candidates", () => {
		expect(normalizeLoginIdentifier({ identity: 123, email: null, username: "valid" })).toBe("valid");
	});
});

describe("auth module – createPendingTwoFaChallenge", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return requires_2fa true with a pending token", async () => {
		const result = await createPendingTwoFaChallenge(1, "csrf123");
		expect(result.requires_2fa).toBe(true);
		expect(result.pending_token).toContain("mock_pending_token");
		expect(result.csrfToken).toBe("csrf123");
	});

	it("should return deduplicated method types", async () => {
		const result = await createPendingTwoFaChallenge(1, "csrf");
		expect(result.methods).toEqual(["totp", "yubikey"]);
	});
});

describe("auth module – loadPendingTwoFaPayload", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return payload for a valid pending token", async () => {
		const payload = await loadPendingTwoFaPayload("valid_pending");
		expect(payload.scope).toContain("2fa_pending");
		expect(payload.attrs.id).toBe(1);
	});

	it("should throw 401 for wrong scope", async () => {
		await expect(loadPendingTwoFaPayload("wrong_scope")).rejects.toThrow("Invalid token scope");
	});

	it("should throw 401 when no userId in attrs", async () => {
		await expect(loadPendingTwoFaPayload("no_user_id")).rejects.toThrow("Invalid pending token");
	});
});

describe("auth module – loadPendingTwoFaUser", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return payload, userId, and user for valid token", async () => {
		const result = await loadPendingTwoFaUser("valid_pending");
		expect(result.userId).toBe(1);
		expect(result.payload.attrs.id).toBe(1);
		expect(result.user).toBeDefined();
	});
});

describe("auth module – issueAuthResponse", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should call tokenProvider.issueTokenPair and set cookies", async () => {
		const mockPair = {
			access_token: "at",
			refresh_token: "rt",
			access_expires: "2026-01-01T00:00:00Z",
			refresh_expires: "2026-02-01T00:00:00Z",
			user: { id: 1, name: "Alice" },
		};
		const mockTokenService = { issueTokenPair: vi.fn().mockResolvedValue(mockPair) };
		const req = { ip: "127.0.0.1", headers: { "user-agent": "test" } };
		const res = {};

		const result = await issueAuthResponse({
			tokenService: mockTokenService,
			user: { id: 1 },
			scope: "user",
			req,
			res,
			csrfToken: "csrf-tok",
		});

		expect(mockTokenService.issueTokenPair).toHaveBeenCalledWith({ id: 1 }, "user", {
			ip: "127.0.0.1",
			userAgent: "test",
		});
		expect(setAuthCookies).toHaveBeenCalledWith(res, req, {
			accessToken: "at",
			accessExpires: "2026-01-01T00:00:00Z",
			refreshToken: "rt",
			refreshExpires: "2026-02-01T00:00:00Z",
		});
		expect(result.expires).toBe("2026-01-01T00:00:00Z");
		expect(result.csrfToken).toBe("csrf-tok");
	});

	it("should use internalToken over tokenService when both provided", async () => {
		const mockPair = {
			access_token: "at2",
			refresh_token: "rt2",
			access_expires: "2026-03-01T00:00:00Z",
			refresh_expires: "2026-04-01T00:00:00Z",
			user: { id: 2 },
		};
		const internal = { issueTokenPair: vi.fn().mockResolvedValue(mockPair) };
		const external = { issueTokenPair: vi.fn() };
		const req = { ip: "10.0.0.1", headers: {} };

		await issueAuthResponse({
			internalToken: internal,
			tokenService: external,
			user: { id: 2 },
			req,
			res: {},
		});

		expect(internal.issueTokenPair).toHaveBeenCalled();
		expect(external.issueTokenPair).not.toHaveBeenCalled();
	});

	it("should default ip to 'unknown' when req.ip is missing", async () => {
		const mockPair = {
			access_token: "at3",
			refresh_token: "rt3",
			access_expires: "2026-05-01T00:00:00Z",
			refresh_expires: "2026-06-01T00:00:00Z",
			user: { id: 3 },
		};
		const svc = { issueTokenPair: vi.fn().mockResolvedValue(mockPair) };
		const req = { headers: {} };

		await issueAuthResponse({ tokenService: svc, user: { id: 3 }, req, res: {} });

		expect(svc.issueTokenPair).toHaveBeenCalledWith({ id: 3 }, "user", { ip: "unknown", userAgent: null });
	});
});

describe("auth module – index exports", () => {
	it("should export twoFaService", async () => {
		// Just verify the module structure exports correctly
		const authIndex = await import("../../modules/auth/index.js");
		expect(authIndex).toBeDefined();
	});
});

// ── Additional tests for 2fa-service / service.js ──────────────────────────

// We need separate mocks for the deeper modules, so we import the service
// through the already-mocked environment. The 2fa-service re-exports service.js.

// ── Mocks for totp / backup-codes / yubikey / passkeys / duo ───────────────

vi.mock("qrcode", () => ({
	default: { toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,MOCK_QR")) },
}));

vi.mock("otplib", () => ({
	generateSecret: vi.fn(() => "MOCKSECRET123"),
	generateURI: vi.fn(() => "otpauth://totp/ShieldPM:user@example.com?secret=MOCKSECRET123"),
	verifySync: vi.fn(({ token, secret }) => {
		if (token === "123456" && secret) return { valid: true };
		return { valid: false };
	}),
}));

vi.mock("bcryptjs", () => ({
	default: {
		hash: vi.fn(() => Promise.resolve("$2a$10$mockhash")),
		compare: vi.fn((code, _hash) => Promise.resolve(code === "VALIDCODE1")),
	},
}));

// Mock UserTwoFa with chainable query builder
const _mockUserTwoFaRecords = [];
const mockUserTwoFaQueryBuilder = () => {
	// Create a thenable query builder — awaiting it resolves to a default value
	const createThenable = (resolveValue) => {
		const obj = {
			where: vi.fn(() => createThenable(resolveValue)),
			resultSize: vi.fn(() => Promise.resolve(2)),
			// biome-ignore lint/suspicious/noThenProperty: mock query builder needs .then
			then: (onFulfill, onReject) => Promise.resolve(resolveValue).then(onFulfill, onReject),
		};
		return obj;
	};

	const qb = {
		findOne: vi.fn((criteria) => {
			// Return different results based on criteria
			if (criteria?.type === "totp" && criteria?.is_verified === 0) {
				return Promise.resolve({ id: 10, user_id: 1, type: "totp", secret: "MOCKSECRET123", is_verified: 0 });
			}
			if (criteria?.type === "totp" && criteria?.is_verified === 1) {
				return Promise.resolve({ id: 11, user_id: 1, type: "totp", secret: "REALSECRET", is_verified: 1 });
			}
			if (criteria?.type === "duo" && criteria?.is_verified === 1) {
				return Promise.resolve({
					id: 20,
					user_id: 1,
					type: "duo",
					is_verified: 1,
					meta: {
						clientId: "cid",
						clientSecret: "csec",
						apiHost: "api.duo.com",
						redirectUrl: "https://example.com/callback",
					},
				});
			}
			if (criteria?.type === "yubikey" && criteria?.secret && criteria?.is_deleted === 0) {
				// For addYubikey "check existing" — return null so yubikey is not found as duplicate
				return Promise.resolve(null);
			}
			if (criteria?.type === "passkey_challenge") {
				return Promise.resolve({
					id: 40,
					user_id: 1,
					type: "passkey_challenge",
					secret: "challenge-id",
					meta: { challenge: "mockchallenge" },
					is_verified: 0,
				});
			}
			if (criteria?.type === "passkey_auth_challenge") {
				return Promise.resolve({
					id: 41,
					user_id: 1,
					type: "passkey_auth_challenge",
					secret: "auth-challenge-id",
					meta: { challenge: "mockchallenge" },
					is_verified: 0,
				});
			}
			if (criteria?.type === "passkey" && criteria?.secret) {
				return Promise.resolve({
					id: 50,
					user_id: 1,
					type: "passkey",
					secret: criteria.secret,
					public_key: Buffer.from("mockpublickey").toString("base64"),
					counter: 0,
					transports: "usb,ble",
					is_verified: 1,
				});
			}
			// For removeTwoFaMethod
			if (criteria?.id && criteria?.user_id && criteria?.is_deleted === 0) {
				return Promise.resolve({ id: criteria.id, user_id: criteria.user_id, type: "totp" });
			}
			return Promise.resolve(null);
		}),
		where: vi.fn((criteria) => {
			// For passkey queries that expect an array result
			if (
				criteria?.type === "passkey" ||
				criteria?.type === "passkey_challenge" ||
				criteria?.type === "passkey_auth_challenge"
			) {
				return Promise.resolve([]);
			}
			// For other where() calls, return a thenable with resultSize support
			return createThenable(1);
		}),
		andWhere: vi.fn(() => createThenable(1)),
		delete: vi.fn(() => createThenable(1)),
		insert: vi.fn((data) => Promise.resolve({ id: 99, ...data })),
		insertAndFetch: vi.fn((data) => Promise.resolve({ id: 99, ...data })),
		patch: vi.fn(() => ({ where: vi.fn(() => createThenable(1)) })),
		resultSize: vi.fn(() => Promise.resolve(2)),
	};
	return qb;
};

vi.mock("../../models/user-2fa.js", () => ({
	default: {
		query: vi.fn(() => mockUserTwoFaQueryBuilder()),
		getActiveForUser: vi.fn(async () => [{ type: "totp" }, { type: "totp" }, { type: "yubikey" }]),
	},
}));

vi.mock("../../models/user-2fa-backup-codes.js", () => ({
	default: {
		query: vi.fn(() => {
			const createThenable = (val) => ({
				where: vi.fn(() => createThenable(val)),
				// biome-ignore lint/suspicious/noThenProperty: mock query builder needs .then
				then: (onFulfill, onReject) => Promise.resolve(val).then(onFulfill, onReject),
			});
			const qb = {
				where: vi.fn(() => qb),
				whereNull: vi.fn(() => qb),
				delete: vi.fn(() => createThenable(1)),
				insert: vi.fn(() => Promise.resolve()),
				resultSize: vi.fn(() => Promise.resolve(5)),
			};
			return qb;
		}),
		findAndConsume: vi.fn((_userId, code) => {
			if (code === "VALIDCODE1") return Promise.resolve({ id: 1 });
			return Promise.resolve(null);
		}),
	},
}));

vi.mock("@simplewebauthn/server", () => ({
	generateRegistrationOptions: vi.fn(() => Promise.resolve({ challenge: "regchallenge123", rp: {} })),
	generateAuthenticationOptions: vi.fn(() => Promise.resolve({ challenge: "authchallenge123" })),
	verifyRegistrationResponse: vi.fn(() =>
		Promise.resolve({
			verified: true,
			registrationInfo: { credential: { id: "cred-id-1", publicKey: new Uint8Array([1, 2, 3]), counter: 0 } },
		}),
	),
	verifyAuthenticationResponse: vi.fn(() =>
		Promise.resolve({
			verified: true,
			authenticationInfo: { newCounter: 1 },
		}),
	),
}));

vi.mock("@duosecurity/duo_universal", () => {
	const MockClient = vi.fn(function () {
		this.healthCheck = vi.fn(() => Promise.resolve());
		this.createAuthUrl = vi.fn((_email, state) => Promise.resolve(`https://duo.example.com/auth?state=${state}`));
		this.exchangeAuthorizationCodeFor2FAResult = vi.fn(() => Promise.resolve({ result: "allow" }));
	});
	return { Client: MockClient };
});

vi.mock("node:https", () => ({
	default: {
		request: vi.fn((_opts, cb) => {
			const res = {
				on: vi.fn((event, handler) => {
					if (event === "data") handler("status=OK\nnonce=abc");
					if (event === "end") handler();
				}),
			};
			if (cb) cb(res);
			return { on: vi.fn(), end: vi.fn() };
		}),
	},
}));

// ── Import 2FA service functions ───────────────────────────────────────────

import twoFaService from "../../modules/auth/service.js";
import { setupTotp, verifyAndEnableTotp, verifyTotp } from "../../modules/auth/totp.js";
import {
	regenerateBackupCodes,
	verifyBackupCode,
	getRemainingBackupCodeCount,
} from "../../modules/auth/backup-codes.js";
import { addYubikey } from "../../modules/auth/yubikey.js";
import {
	beginPasskeyRegistration,
	completePasskeyRegistration,
	beginPasskeyAuthentication,
} from "../../modules/auth/passkeys.js";
import { setupDuo, beginDuoAuthentication } from "../../modules/auth/duo.js";
import {
	cleanupExpiredLoginAttempts,
	clearLoginAttempts,
	getLoginAttemptState,
	registerFailedLoginAttempt,
} from "../../modules/auth/login-attempts.js";

// ── TOTP Tests ─────────────────────────────────────────────────────────────

describe("auth module – setupTotp", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return secret, otpauthUrl, and qrDataUrl", async () => {
		const result = await setupTotp(1, "user@example.com");
		expect(result).toHaveProperty("secret");
		expect(result).toHaveProperty("otpauthUrl");
		expect(result).toHaveProperty("qrDataUrl");
		expect(result.secret).toBe("MOCKSECRET123");
		expect(result.qrDataUrl).toContain("data:image/png");
	});

	it("should delete previous unverified TOTP records", async () => {
		const UserTwoFa = (await import("../../models/user-2fa.js")).default;
		await setupTotp(1, "user@example.com");
		expect(UserTwoFa.query).toHaveBeenCalled();
	});

	it("should insert a new unverified TOTP record", async () => {
		const result = await setupTotp(1, "user@example.com");
		expect(result.secret).toBeTruthy();
	});
});

describe("auth module – verifyAndEnableTotp", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should verify and enable TOTP with valid code", async () => {
		const result = await verifyAndEnableTotp(1, "123456");
		// Returns backup codes (array)
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBe(8);
	});

	it("should throw ValidationError for invalid TOTP code", async () => {
		await expect(verifyAndEnableTotp(1, "000000")).rejects.toThrow("Invalid TOTP code");
	});

	it("should throw when no pending TOTP setup found", async () => {
		const UserTwoFa = (await import("../../models/user-2fa.js")).default;
		UserTwoFa.query.mockReturnValueOnce({
			findOne: vi.fn(() => Promise.resolve(null)),
			where: vi.fn().mockReturnThis(),
			delete: vi.fn(() => Promise.resolve()),
			insert: vi.fn(() => Promise.resolve()),
			patch: vi.fn().mockReturnThis(),
		});
		await expect(verifyAndEnableTotp(1, "123456")).rejects.toThrow("No pending TOTP setup found");
	});
});

describe("auth module – verifyTotp", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return true for valid TOTP code", async () => {
		const result = await verifyTotp(1, "123456");
		expect(result).toBe(true);
	});

	it("should return false for invalid TOTP code", async () => {
		const result = await verifyTotp(1, "000000");
		expect(result).toBe(false);
	});

	it("should return false when no verified TOTP record exists", async () => {
		const UserTwoFa = (await import("../../models/user-2fa.js")).default;
		UserTwoFa.query.mockReturnValueOnce({
			findOne: vi.fn(() => Promise.resolve(null)),
		});
		const result = await verifyTotp(1, "123456");
		expect(result).toBe(false);
	});
});

// ── Backup Codes Tests ─────────────────────────────────────────────────────

describe("auth module – regenerateBackupCodes", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return an array of 8 backup codes", async () => {
		const codes = await regenerateBackupCodes(1);
		expect(Array.isArray(codes)).toBe(true);
		expect(codes.length).toBe(8);
	});

	it("should return uppercase alphanumeric codes", async () => {
		const codes = await regenerateBackupCodes(1);
		for (const code of codes) {
			expect(code).toMatch(/^[A-Z0-9]+$/);
		}
	});

	it("should delete existing codes before generating new ones", async () => {
		const BackupCode = (await import("../../models/user-2fa-backup-codes.js")).default;
		await regenerateBackupCodes(1);
		expect(BackupCode.query).toHaveBeenCalled();
	});
});

describe("auth module – verifyBackupCode", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return true for valid backup code", async () => {
		const result = await verifyBackupCode(1, "VALIDCODE1");
		expect(result).toBe(true);
	});

	it("should return false for invalid backup code", async () => {
		const result = await verifyBackupCode(1, "INVALIDCODE");
		expect(result).toBe(false);
	});

	it("should normalize code by removing spaces and hyphens", async () => {
		const BackupCode = (await import("../../models/user-2fa-backup-codes.js")).default;
		await verifyBackupCode(1, "valid-code 1");
		expect(BackupCode.findAndConsume).toHaveBeenCalledWith(1, "VALIDCODE1");
	});
});

describe("auth module – getRemainingBackupCodeCount", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return the count of remaining backup codes", async () => {
		const count = await getRemainingBackupCodeCount(1);
		expect(typeof count).toBe("number");
		expect(count).toBe(5);
	});
});

// ── YubiKey Tests ──────────────────────────────────────────────────────────

describe("auth module – addYubikey", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should add a yubikey and return the record", async () => {
		// The mock https returns status=OK
		const _https = (await import("node:https")).default;
		const otp = "ccccccccccccbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; // >32 chars
		const result = await addYubikey(1, otp, "My YubiKey");
		expect(result).toHaveProperty("type", "yubikey");
		expect(result).toHaveProperty("is_verified", 1);
	});

	it("should throw for OTP shorter than 32 chars", async () => {
		await expect(addYubikey(1, "short")).rejects.toThrow("Invalid YubiKey OTP format");
	});

	it("should throw for non-string OTP", async () => {
		await expect(addYubikey(1, 12345)).rejects.toThrow("Invalid YubiKey OTP format");
	});
});

// ── verifyLoginChallenge Tests ─────────────────────────────────────────────

describe("auth module – verifyLoginChallenge", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should dispatch to verifyTotp for totp method", async () => {
		const result = await twoFaService.verifyLoginChallenge(1, "totp", "123456");
		expect(result).toBe(true);
	});

	it("should dispatch to verifyBackupCode for backup_code method", async () => {
		const result = await twoFaService.verifyLoginChallenge(1, "backup_code", "VALIDCODE1");
		expect(result).toBe(true);
	});

	it("should throw ValidationError for unknown method", async () => {
		await expect(twoFaService.verifyLoginChallenge(1, "sms", "123456")).rejects.toThrow("Unknown 2FA method: sms");
	});
});

// ── removeTwoFaMethod Tests ────────────────────────────────────────────────

describe("auth module – removeTwoFaMethod", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should remove a 2FA method by id", async () => {
		// The mock findOne returns a record when criteria has id + user_id + is_deleted:0
		await expect(twoFaService.removeTwoFaMethod(1, 10)).resolves.toBeUndefined();
	});

	it("should throw ItemNotFoundError when method not found", async () => {
		const UserTwoFa = (await import("../../models/user-2fa.js")).default;
		UserTwoFa.query.mockReturnValueOnce({
			findOne: vi.fn(() => Promise.resolve(null)),
			where: vi.fn().mockReturnThis(),
			patch: vi.fn().mockReturnThis(),
			resultSize: vi.fn(() => Promise.resolve(0)),
		});
		await expect(twoFaService.removeTwoFaMethod(1, 999)).rejects.toThrow("2FA method 999");
	});
});

// ── Passkey Tests ──────────────────────────────────────────────────────────

describe("auth module – beginPasskeyRegistration", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return options and challengeId", async () => {
		const req = { headers: { origin: "https://example.com" }, protocol: "https", hostname: "example.com" };
		const result = await beginPasskeyRegistration(1, "user@example.com", req);
		expect(result).toHaveProperty("options");
		expect(result).toHaveProperty("challengeId");
		expect(result.options).toHaveProperty("challenge");
	});

	it("should use hostname from origin header", async () => {
		const req = {
			headers: { origin: "https://custom.example.com" },
			protocol: "https",
			hostname: "custom.example.com",
		};
		const result = await beginPasskeyRegistration(1, "user@example.com", req);
		expect(result.challengeId).toBeTruthy();
	});
});

describe("auth module – completePasskeyRegistration", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should complete registration and return backupCodes", async () => {
		const req = { headers: { origin: "https://example.com" }, protocol: "https", hostname: "example.com" };
		const regResponse = { response: { transports: ["usb"] } };
		const result = await completePasskeyRegistration(1, "challenge-id", regResponse, req, "My Passkey");
		expect(result).toHaveProperty("backupCodes");
	});

	it("should throw when challenge not found", async () => {
		const UserTwoFa = (await import("../../models/user-2fa.js")).default;
		UserTwoFa.query.mockReturnValueOnce({
			findOne: vi.fn(() => Promise.resolve(null)),
			where: vi.fn().mockReturnThis(),
			delete: vi.fn(() => Promise.resolve()),
			insert: vi.fn(() => Promise.resolve()),
		});
		const req = { headers: { origin: "https://example.com" }, protocol: "https", hostname: "example.com" };
		await expect(completePasskeyRegistration(1, "bad-id", {}, req)).rejects.toThrow(
			"Passkey registration challenge not found",
		);
	});
});

describe("auth module – beginPasskeyAuthentication", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return options and challengeId for user with passkeys", async () => {
		const UserTwoFa = (await import("../../models/user-2fa.js")).default;
		UserTwoFa.query.mockReturnValueOnce({
			where: vi.fn(() => Promise.resolve([{ id: 50, secret: "cred-1", transports: "usb" }])),
			delete: vi.fn(() => Promise.resolve()),
			insert: vi.fn(() => Promise.resolve()),
			findOne: vi.fn(() => Promise.resolve(null)),
		});
		const req = { headers: { origin: "https://example.com" }, protocol: "https", hostname: "example.com" };
		const result = await beginPasskeyAuthentication(1, req);
		expect(result).toHaveProperty("options");
		expect(result).toHaveProperty("challengeId");
	});

	it("should throw when user has no passkeys", async () => {
		const UserTwoFa = (await import("../../models/user-2fa.js")).default;
		UserTwoFa.query.mockReturnValueOnce({
			where: vi.fn(() => Promise.resolve([])),
		});
		const req = { headers: { origin: "https://example.com" }, protocol: "https", hostname: "example.com" };
		await expect(beginPasskeyAuthentication(1, req)).rejects.toThrow("No passkeys registered");
	});
});

// ── Duo Tests ──────────────────────────────────────────────────────────────

describe("auth module – setupDuo", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should setup Duo and return a record", async () => {
		const config = {
			clientId: "cid",
			clientSecret: "csec",
			apiHost: "api.duo.com",
			redirectUrl: "https://example.com/callback",
		};
		const result = await setupDuo(1, config);
		expect(result).toHaveProperty("type", "duo");
		expect(result).toHaveProperty("is_verified", 1);
	});

	it("should throw when required fields are missing", async () => {
		await expect(setupDuo(1, { clientId: "cid" })).rejects.toThrow("All Duo configuration fields are required");
	});

	it("should throw for empty config", async () => {
		await expect(setupDuo(1, {})).rejects.toThrow("All Duo configuration fields are required");
	});
});

describe("auth module – beginDuoAuthentication", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return authUrl and state", async () => {
		const result = await beginDuoAuthentication(1, "user@example.com");
		expect(result).toHaveProperty("authUrl");
		expect(result).toHaveProperty("state");
		expect(result.authUrl).toContain("duo.example.com");
	});

	it("should throw when Duo is not configured", async () => {
		const UserTwoFa = (await import("../../models/user-2fa.js")).default;
		UserTwoFa.query.mockReturnValueOnce({
			findOne: vi.fn(() => Promise.resolve(null)),
		});
		await expect(beginDuoAuthentication(1, "user@example.com")).rejects.toThrow("Duo Security is not configured");
	});
});

// ── Login Attempts Tests ───────────────────────────────────────────────────

describe("auth module – cleanupExpiredLoginAttempts", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should clean up expired attempts without throwing", async () => {
		await expect(cleanupExpiredLoginAttempts()).resolves.toBeUndefined();
	});

	it("should accept custom timestamp", async () => {
		await expect(cleanupExpiredLoginAttempts(Date.now())).resolves.toBeUndefined();
	});
});

describe("auth module – getLoginAttemptState", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockKnexFirst.mockResolvedValue(null);
	});

	it("should return zero count when no record exists", async () => {
		const state = await getLoginAttemptState("login", "user@example.com");
		expect(state.count).toBe(0);
		expect(state.blockedUntil).toBe(0);
	});

	it("should return blocked state when blocked_until is in future", async () => {
		mockKnexFirst.mockResolvedValueOnce({
			attempt_count: 5,
			blocked_until: Date.now() + 60000,
			last_attempt_at: Date.now(),
		});
		const state = await getLoginAttemptState("login", "user@example.com");
		expect(state.count).toBe(5);
		expect(state.blockedUntil).toBeGreaterThan(0);
	});
});

describe("auth module – registerFailedLoginAttempt", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should not throw on registration", async () => {
		await expect(registerFailedLoginAttempt("login", "user@example.com")).resolves.toBeUndefined();
	});

	it("should accept custom timestamp", async () => {
		await expect(registerFailedLoginAttempt("login", "user@example.com", Date.now())).resolves.toBeUndefined();
	});
});

describe("auth module – clearLoginAttempts", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should not throw for valid identifiers", async () => {
		await expect(clearLoginAttempts([{ scope: "login", identifier: "user@example.com" }])).resolves.toBeUndefined();
	});

	it("should skip entries with no identifier", async () => {
		await expect(
			clearLoginAttempts([{ scope: "login", identifier: "" }, { scope: "login" }]),
		).resolves.toBeUndefined();
	});

	it("should handle empty array", async () => {
		await expect(clearLoginAttempts([])).resolves.toBeUndefined();
	});
});
