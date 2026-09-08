import { describe, expect, it } from "vitest";
import { validatePasswordAuth } from "../../lib/auth-password.js";

describe("local credential validation", () => {
	it.each([
		{ type: "local", secret: "password123" },
		{ type: "password", secret: "short" },
		{ type: "password", secret: "a".repeat(73) },
		{ type: "password", secret: "ä".repeat(37) },
		{ type: "password" },
	])("rejects unsupported or bcrypt-truncated credentials: %j", (auth) => {
		expect(() => validatePasswordAuth(auth)).toThrow();
	});
	it("accepts exactly the bcrypt UTF-8 byte limit", () => {
		expect(() => validatePasswordAuth({ type: "password", secret: "ä".repeat(36) })).not.toThrow();
	});
});
