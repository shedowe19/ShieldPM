import { describe, expect, it } from "vitest";
import { SYSTEM_USER_ID } from "../../lib/constants.js";

describe("constants", () => {
	it("SYSTEM_USER_ID is 1", () => {
		expect(SYSTEM_USER_ID).toBe(1);
	});

	it("SYSTEM_USER_ID is a number", () => {
		expect(typeof SYSTEM_USER_ID).toBe("number");
	});
});
