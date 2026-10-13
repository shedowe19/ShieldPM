import { describe, expect, it, vi } from "vitest";
import userIdFromMe from "../../lib/express/user-id-from-me.js";

const makeAccess = (attrs, fallback = 0) => ({
	token: {
		get: vi.fn(() => attrs),
		getUserId: vi.fn(() => fallback),
	},
});
const runMiddleware = (userId, access) => {
	const req = { params: { user_id: userId } };
	const next = vi.fn();
	userIdFromMe(req, { locals: { access } }, next);
	expect(next).toHaveBeenCalledExactlyOnceWith();
	return req.params.user_id;
};

describe("userIdFromMe middleware", () => {
	it.each([5, "5"])("resolves me using token attrs.id=%s as a number", (id) => {
		const access = makeAccess({ id }, 99);
		expect(runMiddleware("me", access)).toBe(5);
		expect(access.token.get).toHaveBeenCalledWith("attrs");
		expect(access.token.getUserId).not.toHaveBeenCalled();
	});

	it.each([undefined, null, {}, { id: 0 }])("uses the token fallback for missing attrs %s", (attrs) => {
		const access = makeAccess(attrs, "7");
		expect(runMiddleware("me", access)).toBe(7);
		expect(access.token.getUserId).toHaveBeenCalledExactlyOnceWith(1);
	});

	it.each([
		["5", 5],
		["123", 123],
	])("parses numeric URL parameter %s", (parameter, expected) => {
		expect(runMiddleware(parameter, null)).toBe(expected);
	});

	it.each(["me", "abc"])("passes unresolved %s as NaN for downstream authorization", (parameter) => {
		expect(runMiddleware(parameter, null)).toBeNaN();
	});
});
