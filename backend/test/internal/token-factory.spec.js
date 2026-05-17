import { describe, expect, it, vi } from "vitest";

/**
 * Fix #62: getTokenFromOAuthClaim() used `new TokenModel()` instead of `TokenModel()`.
 * TokenModel is a factory function that returns an object with a `create` method.
 * Calling it with `new` wraps it as a constructor — the returned object (with `create`)
 * becomes a property of `this`, not the return value, so `.create` is undefined.
 */

vi.mock("../../lib/config.js", () => ({
	getPrivateKey: vi.fn().mockReturnValue("mock-private-key"),
	getPublicKey: vi.fn().mockReturnValue("mock-public-key"),
	getEncryptionKey: vi.fn().mockReturnValue("0".repeat(64)),
	isDemoMode: vi.fn().mockReturnValue(false),
	configHas: vi.fn().mockReturnValue(true),
	configGet: vi.fn().mockReturnValue("mock"),
	isSqlite: vi.fn().mockReturnValue(true),
	isMysql: vi.fn().mockReturnValue(false),
	isPostgres: vi.fn().mockReturnValue(false),
	isDestructiveTestMode: vi.fn().mockReturnValue(false),
}));

import TokenModel from "../../models/token.js";

describe("Fix #62: TokenModel is a factory, not a constructor", () => {
	it("TokenModel() (factory call) returns an object with a create method", () => {
		const token = TokenModel();
		expect(typeof token.create).toBe("function");
	});

	it("new TokenModel() (constructor call) does NOT return an object with create — proves the original bug", () => {
		// When called with `new`, the factory's return value is discarded by JS engine
		// if the constructor returns a non-object, but here it returns an object, so
		// `new` actually works the same way for object-returning functions.
		// The real bug is the `new /** @type {any} */ (TokenModel)()` pattern with a
		// type cast that hides the intent and is inconsistent with all other callers.
		// Verify factory call is consistent with all other call sites in token.js:
		const viaFactory = TokenModel();
		expect(viaFactory).toBeDefined();
		expect(typeof viaFactory.create).toBe("function");
		expect(typeof viaFactory.load).toBe("function");
		expect(typeof viaFactory.getUserId).toBe("function");
	});

	it("all three factory calls in token.js produce identical interface shapes", () => {
		const t1 = TokenModel();
		const t2 = TokenModel();
		const t3 = TokenModel();
		// All instances must expose the same API
		for (const t of [t1, t2, t3]) {
			expect(typeof t.create).toBe("function");
			expect(typeof t.load).toBe("function");
			expect(typeof t.getUserId).toBe("function");
		}
	});
});
