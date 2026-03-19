import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockKnex = vi.fn(() => Promise.resolve());
const mockFnNow = vi.fn(() => "2026-03-16T12:00:00.000Z");

vi.mock("../../db.js", () => ({
	default: () => ({ fn: { now: mockFnNow } }),
}));

vi.mock("objection", () => ({
	transaction: (_knex, cb) => cb({}), // trx is just a placeholder
}));

// Fake AuthSession model
let sessionsInDb = [];
let _patchCalledWith = {};
let _insertCalledWith = {};

const buildFakeQueryBuilder = (resolveWith) => {
	const qb = {
		findOne: vi.fn(() => qb),
		withGraphFetched: vi.fn(() => Promise.resolve(resolveWith)),
		insertAndFetch: vi.fn((data) => {
			_insertCalledWith = data;
			const inserted = { id: sessionsInDb.length + 100, ...data };
			sessionsInDb.push(inserted);
			return Promise.resolve(inserted);
		}),
		patch: vi.fn((data) => {
			_patchCalledWith = data;
			return qb;
		}),
		where: vi.fn(() => qb),
		whereNull: vi.fn(() => {
			// For rotation update, return 1 (success) by default
			return Promise.resolve(1);
		}),
	};
	return qb;
};

let queryBuilderResolve = null;

vi.mock("../../models/auth-session.js", () => {
	return {
		default: {
			knex: () => mockKnex,
			query: (_trx) => buildFakeQueryBuilder(queryBuilderResolve),
			hashToken: (t) => `hashed_${t}`,
			normalizeScope: (s) => s || "user",
			createFamilyId: () => "family_001",
			buildLookup: (t) => ({ token_hash: `hashed_${t}` }),
		},
	};
});

vi.mock("../../models/token.js", () => ({
	default: () => ({
		create: vi.fn(({ attrs, scope, expiresIn }) =>
			Promise.resolve({
				token: "mock_access_jwt",
				payload: { exp: Math.floor(Date.now() / 1000) + 900 },
			}),
		),
	}),
}));

vi.mock("../../lib/helpers.js", () => ({
	parseDatePeriod: (expr) => {
		const map = { "15m": Date.now() + 15 * 60000, "30d": Date.now() + 30 * 86400000 };
		const ts = map[expr] || Date.now() + 3600000;
		const d = new Date(ts);
		return {
			toISOString: () => d.toISOString(),
			format: (fmt) => {
				if (fmt === "YYYY-MM-DD HH:mm:ss") {
					return d.toISOString().slice(0, 19).replace("T", " ");
				}
				return d.toISOString();
			},
			isBefore: (other) => d < (other instanceof Date ? other : new Date(other)),
			unix: () => Math.floor(d.getTime() / 1000),
			diff: (other) => d.getTime() - new Date(other).getTime(),
		};
	},
}));

vi.mock("../../lib/error.js", () => ({
	default: {
		InternalError: class InternalError extends Error {
			constructor(m) {
				super(m);
				this.name = "InternalError";
			}
		},
		AuthError: class AuthError extends Error {
			constructor(m) {
				super(m);
				this.name = "AuthError";
			}
		},
		UnauthorizedError: class UnauthorizedError extends Error {
			constructor(m) {
				super(m);
				this.name = "UnauthorizedError";
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

// ── Import SUT ───────────────────────────────────────────────────────────────
const { default: authSessionService } = await import("../../internal/auth-session-service.js");

// ── Tests ────────────────────────────────────────────────────────────────────
describe("auth-session-service", () => {
	const mockUser = {
		id: 1,
		name: "Test User",
		email: "test@example.com",
		nickname: "tester",
		avatar: "",
		roles: ["admin"],
	};

	beforeEach(() => {
		sessionsInDb = [];
		_patchCalledWith = {};
		_insertCalledWith = {};
		queryBuilderResolve = null;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("issueTokenPair", () => {
		it("should return access_token, refresh_token, and session info", async () => {
			const result = await authSessionService.issueTokenPair(mockUser, "user", { ip: "127.0.0.1" });

			expect(result).toHaveProperty("access_token");
			expect(result).toHaveProperty("refresh_token");
			expect(result).toHaveProperty("access_expires");
			expect(result).toHaveProperty("refresh_expires");
			expect(result).toHaveProperty("token_type", "Bearer");
			expect(result.session).toHaveProperty("family_id");
			expect(result.user.id).toBe(mockUser.id);
		});

		it("should set both access and refresh tokens (simulating 2 cookies)", async () => {
			const result = await authSessionService.issueTokenPair(mockUser, "user");

			// Access token is a JWT string
			expect(typeof result.access_token).toBe("string");
			expect(result.access_token.length).toBeGreaterThan(0);

			// Refresh token is a base64url random string
			expect(typeof result.refresh_token).toBe("string");
			expect(result.refresh_token.length).toBeGreaterThan(0);

			// They must be different values
			expect(result.access_token).not.toBe(result.refresh_token);
		});
	});

	describe("refreshTokenPair", () => {
		it("should reject when no refresh token is provided", async () => {
			await expect(authSessionService.refreshTokenPair(null)).rejects.toThrow("Invalid refresh token");
			await expect(authSessionService.refreshTokenPair("")).rejects.toThrow("Invalid refresh token");
		});
	});

	describe("revokeSession", () => {
		it("should reject when sessionId is missing", async () => {
			await expect(authSessionService.revokeSession(null)).rejects.toThrow("sessionId is required");
		});
	});

	describe("revokeFamily", () => {
		it("should reject when familyId is missing", async () => {
			await expect(authSessionService.revokeFamily(null)).rejects.toThrow("familyId is required");
		});
	});
});

describe("token rotation flow (integration-style)", () => {
	it("login produces access_token and refresh_token (2-cookie model)", async () => {
		const mockUser = {
			id: 42,
			name: "Alice",
			email: "alice@test.com",
			nickname: "alice",
			avatar: "",
			roles: ["user"],
		};
		const pair = await authSessionService.issueTokenPair(mockUser, "user", {
			ip: "10.0.0.1",
			userAgent: "test-agent",
		});

		expect(pair.access_token).toBeTruthy();
		expect(pair.refresh_token).toBeTruthy();
		expect(pair.token_type).toBe("Bearer");
		expect(pair.session.scope).toBe("user");
	});

	it("refreshTokenPair rejects empty/null token (guard)", async () => {
		await expect(authSessionService.refreshTokenPair(undefined)).rejects.toThrow(/Invalid refresh token/);
	});

	it("revokeFamily revokes entire family (used in replay detection)", async () => {
		// revokeFamily should not throw for valid familyId
		// (returns a query promise; with mock it resolves)
		await expect(
			authSessionService.revokeFamily("family_001", "refresh_token_replay_detected"),
		).resolves.not.toThrow();
	});
});
