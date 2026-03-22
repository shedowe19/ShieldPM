import { describe, expect, it, vi } from "vitest";
import jwtMiddleware from "../../lib/express/jwt.js";

describe("express/jwt middleware", () => {
	const makeReq = (headers = {}, cookies = {}) => ({
		headers,
		cookies,
	});
	const makeRes = () => ({ locals: {} });

	it("extracts Bearer token from Authorization header", () => {
		const req = makeReq({ authorization: "Bearer my-token-123" });
		const res = makeRes();
		const next = vi.fn();

		jwtMiddleware()(req, res, next);

		expect(res.locals.token).toBe("my-token-123");
		expect(next).toHaveBeenCalled();
	});

	it("ignores non-Bearer auth schemes", () => {
		const req = makeReq({ authorization: "Basic abc123" });
		const res = makeRes();
		const next = vi.fn();

		jwtMiddleware()(req, res, next);

		expect(res.locals.token).toBeUndefined();
		expect(next).toHaveBeenCalled();
	});

	it("falls back to cookie when no Authorization header", () => {
		const req = makeReq({}, { shieldpm_jwt: "cookie-token" });
		const res = makeRes();
		const next = vi.fn();

		jwtMiddleware()(req, res, next);

		expect(res.locals.token).toBe("cookie-token");
		expect(next).toHaveBeenCalled();
	});

	it("prefers Authorization header over cookie", () => {
		const req = makeReq({ authorization: "Bearer header-tok" }, { shieldpm_jwt: "cookie-tok" });
		const res = makeRes();
		const next = vi.fn();

		jwtMiddleware()(req, res, next);

		expect(res.locals.token).toBe("header-tok");
	});

	it("calls next with no token when neither header nor cookie present", () => {
		const req = makeReq();
		const res = makeRes();
		const next = vi.fn();

		jwtMiddleware()(req, res, next);

		expect(res.locals.token).toBeUndefined();
		expect(next).toHaveBeenCalled();
	});

	it("ignores Bearer with missing token value", () => {
		const req = makeReq({ authorization: "Bearer " });
		const res = makeRes();
		const next = vi.fn();

		jwtMiddleware()(req, res, next);

		expect(res.locals.token).toBeUndefined();
		expect(next).toHaveBeenCalled();
	});
});
