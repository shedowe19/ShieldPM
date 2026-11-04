import { describe, expect, it } from "vitest";
import normalizeScope from "../../lib/token-scope.js";

describe("legacy token scope compatibility", () => {
	it("maps the legacy all scope to user", () => {
		expect(normalizeScope(["all"])).toEqual(["user"]);
		expect(normalizeScope("all")).toEqual(["user"]);
	});

	it("keeps normal scopes unchanged", () => {
		expect(normalizeScope(["user"])).toEqual(["user"]);
		expect(normalizeScope(["user", "admin"])).toEqual(["user", "admin"]);
		expect(normalizeScope("user")).toBe("user");
	});

	it("keeps undefined scopes unchanged", () => {
		expect(normalizeScope(undefined)).toBeUndefined();
	});
});
