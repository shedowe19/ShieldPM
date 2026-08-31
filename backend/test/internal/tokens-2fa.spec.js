/**
 * Tests for the 2FA-aware login flow in internal/token.js
 *
 * Verifies that getTokenFromEmail respects 2FA state and that
 * the pending token concept works correctly.
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
								roles: ["user"],
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
		query: vi.fn(() => {
			const query = {
				where: vi.fn(() => query),
				first: vi.fn(() =>
					Promise.resolve({
						secret: "hashedpassword",
						verifyPassword: vi.fn(() => Promise.resolve(true)),
					}),
				),
			};
			return query;
		}),
	},
}));

vi.mock("../../models/user-2fa.js", () => ({
	default: {
		hasActive2FA: vi.fn(async () => false),
		getActiveForUser: vi.fn(async () => []),
	},
}));

vi.mock("../../internal/auth-session-service.js", () => ({
	default: {
		ACCESS_TOKEN_TTL: "15m",
		REFRESH_TOKEN_TTL: "30d",
		issueTokenPair: vi.fn(async (user) => ({
			access_token: "mock_access_token",
			refresh_token: "mock_refresh_token",
			access_expires: new Date(Date.now() + 900000).toISOString(),
			refresh_expires: new Date(Date.now() + 30 * 86400000).toISOString(),
			token_type: "Bearer",
			session: { id: 1, family_id: "fam1", scope: "user" },
			user,
		})),
		refreshTokenPair: vi.fn(),
		revokeSession: vi.fn(),
		revokeFamily: vi.fn(),
	},
}));

vi.mock("../../models/token.js", () => ({
	default: vi.fn(() => ({
		create: vi.fn(({ scope, expiresIn }) =>
			Promise.resolve({
				token: `mock_token_scope_${Array.isArray(scope) ? scope.join(",") : scope}_exp_${expiresIn}`,
				payload: {},
			}),
		),
		load: vi.fn(),
	})),
}));

vi.mock("../../lib/error.js", () => ({
	default: {
		AuthError: class AuthError extends Error {
			constructor(m) {
				super(m);
				this.name = "AuthError";
				this.status = 400;
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

// ── Tests ──────────────────────────────────────────────────────────────────

const { default: internalToken } = await import("../../internal/token.js");
const { default: UserTwoFa } = await import("../../models/user-2fa.js");

describe("internalToken.getTokenFromEmail (2FA-aware login)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns a verified identity without minting a DB-unbound token", async () => {
		UserTwoFa.hasActive2FA.mockResolvedValue(false);

		const result = await internalToken.getTokenFromEmail({
			identity: "alice@example.com",
			secret: "correctpassword",
		});

		expect(result).toHaveProperty("user");
		expect(result.authentication_methods).toEqual(["pwd"]);
		expect(result).not.toHaveProperty("token");
		expect(result.user.email).toBe("alice@example.com");
	});

	it("issueTokenPair is delegated to auth-session-service", async () => {
		const user = { id: 1, name: "Alice", email: "alice@example.com", nickname: "alice", avatar: "", roles: [] };
		const pair = await internalToken.issueTokenPair(user, "user", { ip: "127.0.0.1" });

		expect(pair).toHaveProperty("access_token");
		expect(pair).toHaveProperty("refresh_token");
		expect(pair.token_type).toBe("Bearer");
	});
});

describe("UserTwoFa.hasActive2FA", () => {
	it("returns false when mocked with no active methods", async () => {
		UserTwoFa.hasActive2FA.mockResolvedValue(false);
		const result = await UserTwoFa.hasActive2FA(1);
		expect(result).toBe(false);
	});

	it("returns true when mocked with active methods", async () => {
		UserTwoFa.hasActive2FA.mockResolvedValue(true);
		const result = await UserTwoFa.hasActive2FA(1);
		expect(result).toBe(true);
	});
});
