import { describe, expect, it } from "vitest";
import { omissions } from "../../modules/stream/helpers.js";

describe("stream module – helpers", () => {
	describe("omissions", () => {
		it("should return expected omission keys", () => {
			const result = omissions();
			expect(result).toContain("is_deleted");
			expect(result).toContain("owner.is_deleted");
			expect(result).toContain("certificate.is_deleted");
		});

		it("should return an array of strings", () => {
			const result = omissions();
			expect(Array.isArray(result)).toBe(true);
			for (const item of result) {
				expect(typeof item).toBe("string");
			}
		});

		it("should return 3 items", () => {
			expect(omissions()).toHaveLength(3);
		});

		it("should return a fresh array each call", () => {
			const a = omissions();
			const b = omissions();
			expect(a).toEqual(b);
			expect(a).not.toBe(b);
		});
	});
});
