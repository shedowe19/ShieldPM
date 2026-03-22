import { describe, expect, it, vi } from "vitest";

// Mock the Access constructor — must be a real function so `new` works
vi.mock("../../lib/access.js", () => {
	return {
		default: function MockAccess(token) {
			this.token = {
				getUserId: () => (token ? 1 : null),
			};
			this.load = vi.fn().mockResolvedValue(null);
			return {
				token: this.token,
				load: this.load,
			};
		},
	};
});

const jwtDecode = (await import("../../lib/express/jwt-decode.js")).default;

describe("express/jwt-decode middleware", () => {
	const makeReq = (url = "/test", method = "GET") => ({
		url,
		method,
	});
	const makeRes = () => ({ locals: {} });

	it("sets res.locals.access and calls next", async () => {
		const req = makeReq();
		const res = makeRes();
		res.locals.token = "some-token";
		const next = vi.fn();

		await jwtDecode()(req, res, next);

		expect(res.locals.access).not.toBeNull();
		expect(next).toHaveBeenCalled();
	});

	it("works with null token", async () => {
		const req = makeReq();
		const res = makeRes();
		res.locals.token = null;
		const next = vi.fn();

		await jwtDecode()(req, res, next);

		expect(res.locals.access).not.toBeNull();
		expect(next).toHaveBeenCalled();
	});

	it("calls access.load with oidcAccess=true for GET /oidc-config without user", async () => {
		const req = makeReq("/oidc-config", "GET");
		const res = makeRes();
		res.locals.token = null;
		const next = vi.fn();

		await jwtDecode()(req, res, next);

		expect(res.locals.access.load).toHaveBeenCalled();
		expect(next).toHaveBeenCalled();
	});
});
