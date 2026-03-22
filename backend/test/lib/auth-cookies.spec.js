import { describe, expect, it, vi } from "vitest";
import { clearAuthCookies, setAuthCookies, ACCESS_COOKIE, REFRESH_COOKIE } from "../../lib/auth-cookies.js";

describe("auth-cookies", () => {
	const makRes = () => ({
		cookie: vi.fn(),
		clearCookie: vi.fn(),
	});

	describe("setAuthCookies", () => {
		it("sets access and refresh cookies with secure flag on https", () => {
			const res = makRes();
			const req = { secure: true, headers: {} };
			const tokens = {
				accessToken: "acc-tok",
				accessExpires: new Date(Date.now() + 3600000).toISOString(),
				refreshToken: "ref-tok",
				refreshExpires: new Date(Date.now() + 86400000).toISOString(),
			};
			setAuthCookies(res, req, tokens);

			expect(res.cookie).toHaveBeenCalledTimes(2);
			const [accName, accVal, accOpts] = res.cookie.mock.calls[0];
			expect(accName).toBe(ACCESS_COOKIE);
			expect(accVal).toBe("acc-tok");
			expect(accOpts.httpOnly).toBe(true);
			expect(accOpts.secure).toBe(true);
			expect(accOpts.sameSite).toBe("strict");

			const [refName, refVal, refOpts] = res.cookie.mock.calls[1];
			expect(refName).toBe(REFRESH_COOKIE);
			expect(refVal).toBe("ref-tok");
			expect(refOpts.path).toBe("/api/tokens");
		});

		it("sets secure=false on plain http", () => {
			const res = makRes();
			const req = { secure: false, headers: {} };
			const tokens = {
				accessToken: "a",
				accessExpires: new Date(Date.now() + 1000).toISOString(),
				refreshToken: "r",
				refreshExpires: new Date(Date.now() + 1000).toISOString(),
			};
			setAuthCookies(res, req, tokens);
			expect(res.cookie.mock.calls[0][2].secure).toBe(false);
		});

		it("detects https via x-forwarded-proto header", () => {
			const res = makRes();
			const req = { secure: false, headers: { "x-forwarded-proto": "https" } };
			const tokens = {
				accessToken: "a",
				accessExpires: new Date(Date.now() + 1000).toISOString(),
				refreshToken: "r",
				refreshExpires: new Date(Date.now() + 1000).toISOString(),
			};
			setAuthCookies(res, req, tokens);
			expect(res.cookie.mock.calls[0][2].secure).toBe(true);
		});

		it("handles undefined expiry gracefully", () => {
			const res = makRes();
			const req = { secure: false, headers: {} };
			const tokens = {
				accessToken: "a",
				accessExpires: undefined,
				refreshToken: "r",
				refreshExpires: undefined,
			};
			setAuthCookies(res, req, tokens);
			expect(res.cookie.mock.calls[0][2].maxAge).toBeUndefined();
			expect(res.cookie.mock.calls[1][2].maxAge).toBeUndefined();
		});

		it("computes positive maxAge for future expiry", () => {
			const res = makRes();
			const req = { secure: false, headers: {} };
			const futureMs = Date.now() + 60000;
			const tokens = {
				accessToken: "a",
				accessExpires: new Date(futureMs).toISOString(),
				refreshToken: "r",
				refreshExpires: new Date(futureMs).toISOString(),
			};
			setAuthCookies(res, req, tokens);
			expect(res.cookie.mock.calls[0][2].maxAge).toBeGreaterThan(0);
		});
	});

	describe("clearAuthCookies", () => {
		it("clears both cookies", () => {
			const res = makRes();
			clearAuthCookies(res);
			expect(res.clearCookie).toHaveBeenCalledTimes(2);
			expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_COOKIE);
			expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, { path: "/api/tokens" });
		});
	});

	describe("constants", () => {
		it("exports expected cookie names", () => {
			expect(ACCESS_COOKIE).toBe("shieldpm_jwt");
			expect(REFRESH_COOKIE).toBe("shieldpm_refresh");
		});
	});
});
