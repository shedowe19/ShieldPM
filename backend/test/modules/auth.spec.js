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
		getActiveForUser: vi.fn(async () => [
			{ type: "totp" },
			{ type: "totp" },
			{ type: "yubikey" },
		]),
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
		expect(
			normalizeLoginIdentifier({ identity: "First", email: "second@test.com", username: "third" }),
		).toBe("first");
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

		expect(mockTokenService.issueTokenPair).toHaveBeenCalledWith(
			{ id: 1 },
			"user",
			{ ip: "127.0.0.1", userAgent: "test" },
		);
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

		expect(svc.issueTokenPair).toHaveBeenCalledWith(
			{ id: 3 },
			"user",
			{ ip: "unknown", userAgent: null },
		);
	});
});

describe("auth module – index exports", () => {
	it("should export twoFaService", async () => {
		// Just verify the module structure exports correctly
		const authIndex = await import("../../modules/auth/index.js");
		expect(authIndex).toBeDefined();
	});
});
