import { describe, expect, it } from "vitest";
import { omissions } from "../../modules/dead-host/helpers.js";

describe("dead-host module – helpers", () => {
	describe("omissions", () => {
		it("should return array containing is_deleted", () => {
			const result = omissions();
			expect(result).toContain("is_deleted");
		});

		it("should return an array", () => {
			expect(Array.isArray(omissions())).toBe(true);
		});

		it("should have exactly 1 item", () => {
			expect(omissions()).toHaveLength(1);
		});

		it("should return a fresh array each call", () => {
			const a = omissions();
			const b = omissions();
			expect(a).not.toBe(b);
			expect(a).toEqual(b);
		});
	});
});
