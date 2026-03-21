/**
 * Tests for backend/modules/token/ (non-2FA parts)
 * - constants.js: DUMMY_HASH, ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N
 * - auth.js: getTokenFromEmail, getTokenFromOAuthClaim
 * - issue.js: getFreshToken, getTokenFromUser
 * - service.js: default export aggregation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../../models/user.js", () => ({
	default: {
		query: vi.fn(() => ({
			where: vi.fn(() => ({
				andWhere: vi.fn(() => ({
					andWhere: vi.fn(() => ({
						first: vi.fn(() =>
							Promise.resolve({
								id: 1,
								name: "Alice",
								email: "alice@example.com",
								nickname: "alice",
								avatar: "",
								roles: ["user", "admin"],
							}),
						),
					})),
				})),
			})),
		})),
	},
}));

vi.mock("../../models/auth.js", () => ({
	default: {
		query: vi.fn(() => ({
			where: vi.fn(() => ({
				where: vi.fn(() => ({
					first: vi.fn(() =>
						Promise.resolve({
							secret: "hashedpw",
							verifyPassword: vi.fn(() => Promise.resolve(true)),
						}),
					),
				})),
			})),
		})),
	},
}));

vi.mock("../../models/token.js", () => {
	const tokenInstance = {
		create: vi.fn(({ scope, expiresIn: _expiresIn }) =>
			Promise.resolve({
				token: `signed_token_${Array.isArray(scope) ? scope.join(",") : scope}`,
				payload: {},
			}),
		),
		load: vi.fn(),
	};
	// Must work both as TokenModel() and new TokenModel()
	function TokenModelMock() {
		return tokenInstance;
	}
	return { default: TokenModelMock };
});

vi.mock("../../lib/error.js", () => ({
	default: {
		AuthError: class AuthError extends Error {
			constructor(m, i18n) {
				super(m);
				this.name = "AuthError";
				this.status = 400;
				this.i18n = i18n;
			}
		},
		UnauthorizedError: class UnauthorizedError extends Error {
			constructor(m) {
				super(m);
				this.name = "UnauthorizedError";
				this.status = 401;
			}
		},
		InternalError: class InternalError extends Error {
			constructor(m) {
				super(m);
				this.name = "InternalError";
			}
		},
		ValidationError: class ValidationError extends Error {
			constructor(m) {
				super(m);
				this.name = "ValidationError";
			}
		},
	},
}));

vi.mock("../../lib/helpers.js", () => ({
	parseDatePeriod: (expr) => {
		if (expr === "invalid") return null;
		const ms = expr.endsWith("m") ? Number.parseInt(expr, 10) * 60000 : 86400000;
		const d = new Date(Date.now() + ms);
		return {
			toISOString: () => d.toISOString(),
			format: () => d.toISOString().slice(0, 19).replace("T", " "),
		};
	},
}));

vi.mock("bcryptjs", () => ({
	default: {
		compare: vi.fn(() => Promise.resolve(true)),
		hash: vi.fn(() => Promise.resolve("$2a$10$hashed")),
	},
}));

vi.mock("../../modules/auth-session/service.js", () => ({
	default: {
		issueTokenPair: vi.fn(async (user) => ({
			access_token: "at",
			refresh_token: "rt",
			access_expires: new Date(Date.now() + 900000).toISOString(),
			refresh_expires: new Date(Date.now() + 30 * 86400000).toISOString(),
			token_type: "Bearer",
			user,
		})),
		refreshTokenPair: vi.fn(),
		revokeSession: vi.fn(),
		revokeFamily: vi.fn(),
	},
}));

// ── Imports ────────────────────────────────────────────────────────────────

import {
	DUMMY_HASH,
	ERROR_MESSAGE_INVALID_AUTH,
	ERROR_MESSAGE_INVALID_AUTH_I18N,
} from "../../modules/token/constants.js";
import { getTokenFromEmail, getTokenFromOAuthClaim } from "../../modules/token/auth.js";
import { getFreshToken, getTokenFromUser } from "../../modules/token/issue.js";
import tokenService from "../../modules/token/service.js";
import userModel from "../../models/user.js";
import authModel from "../../models/auth.js";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("token module – constants", () => {
	it("DUMMY_HASH should be a bcrypt hash string", () => {
		expect(DUMMY_HASH).toMatch(/^\$2[aby]\$/);
	});

	it("ERROR_MESSAGE_INVALID_AUTH should be a user-facing message", () => {
		expect(ERROR_MESSAGE_INVALID_AUTH).toBe("Invalid email or password");
	});

	it("ERROR_MESSAGE_INVALID_AUTH_I18N should be an i18n key", () => {
		expect(ERROR_MESSAGE_INVALID_AUTH_I18N).toBe("error.invalid-auth");
	});
});

describe("token module – getTokenFromEmail", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return token and user on valid credentials", async () => {
		const result = await getTokenFromEmail({
			identity: "alice@example.com",
			secret: "password123",
		});
		expect(result).toHaveProperty("token");
		expect(result).toHaveProperty("expires");
		expect(result.user.email).toBe("alice@example.com");
		expect(result.user.id).toBe(1);
	});

	it("should throw AuthError when user is not found", async () => {
		userModel.query.mockReturnValueOnce({
			where: vi.fn(() => ({
				andWhere: vi.fn(() => ({
					andWhere: vi.fn(() => ({
						first: vi.fn(() => Promise.resolve(null)),
					})),
				})),
			})),
		});

		await expect(getTokenFromEmail({ identity: "unknown@test.com", secret: "pw" })).rejects.toThrow(
			"Invalid email or password",
		);
	});

	it("should throw AuthError when no auth record exists", async () => {
		authModel.query.mockReturnValueOnce({
			where: vi.fn(() => ({
				where: vi.fn(() => ({
					first: vi.fn(() => Promise.resolve(null)),
				})),
			})),
		});

		await expect(getTokenFromEmail({ identity: "alice@example.com", secret: "pw" })).rejects.toThrow(
			"Invalid email or password",
		);
	});

	it("should throw AuthError when password is invalid", async () => {
		authModel.query.mockReturnValueOnce({
			where: vi.fn(() => ({
				where: vi.fn(() => ({
					first: vi.fn(() =>
						Promise.resolve({
							secret: "hash",
							verifyPassword: vi.fn(() => Promise.resolve(false)),
						}),
					),
				})),
			})),
		});

		await expect(getTokenFromEmail({ identity: "alice@example.com", secret: "wrong" })).rejects.toThrow(
			"Invalid email or password",
		);
	});

	it("should throw AuthError for invalid scope", async () => {
		await expect(
			getTokenFromEmail({ identity: "alice@example.com", secret: "pw", scope: "superadmin" }),
		).rejects.toThrow("Invalid scope: superadmin");
	});

	it("should allow admin scope when user has admin role", async () => {
		const result = await getTokenFromEmail({
			identity: "alice@example.com",
			secret: "pw",
			scope: "admin",
		});
		expect(result).toHaveProperty("token");
	});
});

describe("token module – getTokenFromOAuthClaim", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return token and expires for valid OAuth user", async () => {
		const result = await getTokenFromOAuthClaim({ identity: "alice@example.com" });
		expect(result).toHaveProperty("token");
		expect(result).toHaveProperty("expires");
	});

	it("should throw AuthError when user not found", async () => {
		userModel.query.mockReturnValueOnce({
			where: vi.fn(() => ({
				andWhere: vi.fn(() => ({
					andWhere: vi.fn(() => ({
						first: vi.fn(() => Promise.resolve(null)),
					})),
				})),
			})),
		});

		await expect(getTokenFromOAuthClaim({ identity: "unknown@test.com" })).rejects.toThrow(
			"Invalid email or password",
		);
	});
});

describe("token module – getFreshToken", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return a fresh token when access has a userId", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 42),
				get: vi.fn(() => ["user"]),
				hasScope: vi.fn(() => false),
			},
		};
		const result = await getFreshToken(access, { expiry: "1d" });
		expect(result).toHaveProperty("token");
		expect(result).toHaveProperty("expires");
		expect(result.user.id).toBe(42);
	});

	it("should throw UnauthorizedError when no active session", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 0),
			},
		};
		await expect(getFreshToken(access)).rejects.toThrow("No active session found");
	});

	it("should throw AuthError for invalid expiry", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 1),
				get: vi.fn(() => ["user"]),
				hasScope: vi.fn(() => false),
			},
		};
		await expect(getFreshToken(access, { expiry: "invalid" })).rejects.toThrow("Invalid expiry time");
	});

	it("should allow admin to override scope to job-board", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 5),
				get: vi.fn(() => ["admin"]),
				hasScope: vi.fn((s) => s === "admin"),
			},
		};
		const result = await getFreshToken(access, { scope: "job-board", expiry: "1d" });
		expect(result.user.id).toBe(0);
	});
});

describe("token module – getTokenFromUser", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should return a token for a given user", async () => {
		const user = { id: 7, name: "Bob" };
		const result = await getTokenFromUser(user);
		expect(result).toHaveProperty("token");
		expect(result).toHaveProperty("expires");
		expect(result.user).toBe(user);
	});
});

describe("token module – service exports", () => {
	it("should export all expected methods", () => {
		expect(typeof tokenService.getTokenFromEmail).toBe("function");
		expect(typeof tokenService.getTokenFromOAuthClaim).toBe("function");
		expect(typeof tokenService.getFreshToken).toBe("function");
		expect(typeof tokenService.getTokenFromUser).toBe("function");
		expect(typeof tokenService.issueTokenPair).toBe("function");
		expect(typeof tokenService.refreshTokenPair).toBe("function");
		expect(typeof tokenService.revokeSession).toBe("function");
		expect(typeof tokenService.revokeFamily).toBe("function");
	});
});

// ── Expanded getFreshToken edge cases ──────────────────────────────────────

describe("token module – getFreshToken edge cases", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should use default expiry of 1d when data is null", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 1),
				get: vi.fn(() => ["user"]),
				hasScope: vi.fn(() => false),
			},
		};
		const result = await getFreshToken(access, null);
		expect(result).toHaveProperty("token");
		expect(result).toHaveProperty("expires");
	});

	it("should use default expiry of 1d when data is undefined", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 1),
				get: vi.fn(() => ["user"]),
				hasScope: vi.fn(() => false),
			},
		};
		const result = await getFreshToken(access);
		expect(result).toHaveProperty("token");
	});

	it("should throw UnauthorizedError when userId is 0 and no admin scope override", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 0),
			},
		};
		await expect(getFreshToken(access, {})).rejects.toThrow("No active session found");
	});

	it("should not override scope when user is not admin", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 1),
				get: vi.fn(() => ["user"]),
				hasScope: vi.fn(() => false),
			},
		};
		const result = await getFreshToken(access, { scope: "admin", expiry: "1d" });
		// scope override should be ignored since hasScope('admin') is false
		expect(result).toHaveProperty("token");
		expect(result.user.id).toBe(1); // Not 0
	});

	it("should set id to 0 for worker scope when admin", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 5),
				get: vi.fn(() => ["admin"]),
				hasScope: vi.fn((s) => s === "admin"),
			},
		};
		const result = await getFreshToken(access, { scope: "worker", expiry: "1d" });
		expect(result.user.id).toBe(0);
	});

	it("should keep original user id for non-special scopes as admin", async () => {
		const access = {
			token: {
				getUserId: vi.fn(() => 5),
				get: vi.fn(() => ["admin"]),
				hasScope: vi.fn((s) => s === "admin"),
			},
		};
		const result = await getFreshToken(access, { scope: "custom-scope", expiry: "1d" });
		expect(result.user.id).toBe(5);
	});
});

// ── Expanded getTokenFromUser error paths ──────────────────────────────────

describe("token module – getTokenFromUser extended", () => {
	beforeEach(() => vi.clearAllMocks());

	it("should include the user object in the response", async () => {
		const user = { id: 42, name: "Charlie", email: "charlie@test.com" };
		const result = await getTokenFromUser(user);
		expect(result.user).toBe(user);
		expect(result.user.id).toBe(42);
	});

	it("should return a valid expires ISO string", async () => {
		const user = { id: 1 };
		const result = await getTokenFromUser(user);
		expect(result.expires).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("should always use user scope", async () => {
		const user = { id: 1, roles: ["admin"] };
		const result = await getTokenFromUser(user);
		expect(result).toHaveProperty("token");
		// The token includes 'user' scope per the signed_token_ mock
		expect(result.token).toContain("signed_token_user");
	});
});
