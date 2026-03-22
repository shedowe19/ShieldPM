import { describe, expect, it } from "vitest";
import { hashToken, createFamilyId, createJti, normalizeScope } from "../../lib/auth-session-token.js";

describe("auth-session-token", () => {
	describe("hashToken", () => {
		it("returns a hex sha256 hash of the input", () => {
			const hash = hashToken("mytoken");
			expect(hash).toMatch(/^[0-9a-f]{64}$/);
		});

		it("returns consistent hash for same input", () => {
			expect(hashToken("abc")).toBe(hashToken("abc"));
		});

		it("returns different hash for different input", () => {
			expect(hashToken("a")).not.toBe(hashToken("b"));
		});

		it("throws TypeError on empty string", () => {
			expect(() => hashToken("")).toThrow(TypeError);
		});

		it("throws TypeError on null", () => {
			expect(() => hashToken(null)).toThrow(TypeError);
		});

		it("throws TypeError on non-string", () => {
			expect(() => hashToken(123)).toThrow(TypeError);
		});
	});

	describe("createFamilyId", () => {
		it("returns a valid UUID v4 format", () => {
			const id = createFamilyId();
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
		});

		it("returns unique values", () => {
			expect(createFamilyId()).not.toBe(createFamilyId());
		});
	});

	describe("createJti", () => {
		it("returns a 32-char hex string", () => {
			const jti = createJti();
			expect(jti).toMatch(/^[0-9a-f]{32}$/);
		});

		it("returns unique values", () => {
			expect(createJti()).not.toBe(createJti());
		});
	});

	describe("normalizeScope", () => {
		it("returns array as-is", () => {
			expect(normalizeScope(["user", "admin"])).toEqual(["user", "admin"]);
		});

		it("wraps a string in an array", () => {
			expect(normalizeScope("user")).toEqual(["user"]);
		});

		it("trims whitespace from string", () => {
			expect(normalizeScope("  user  ")).toEqual(["user"]);
		});

		it("returns empty array for empty string", () => {
			expect(normalizeScope("")).toEqual([]);
		});

		it("returns empty array for whitespace-only string", () => {
			expect(normalizeScope("   ")).toEqual([]);
		});

		it("returns empty array for null", () => {
			expect(normalizeScope(null)).toEqual([]);
		});

		it("returns empty array for undefined", () => {
			expect(normalizeScope(undefined)).toEqual([]);
		});
	});
});
