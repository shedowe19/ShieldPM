import { describe, expect, it, vi } from "vitest";
import {
	getAccessCookie,
	getActorRefreshCookie,
	getRefreshCookie,
	SECURE_ACCESS_COOKIE,
	SECURE_ACTOR_REFRESH_COOKIE,
	SECURE_REFRESH_COOKIE,
	setActorRefreshCookie,
	setAuthCookies,
} from "../../lib/auth-cookies.js";

const createResponse = () => ({ cookie: vi.fn(), clearCookie: vi.fn() });

describe("scheme-bound authentication cookies", () => {
	it("never falls back to an injectable legacy cookie on HTTPS", () => {
		const req = {
			secure: true,
			cookies: {
				shieldpm_jwt: "attacker-access",
				shieldpm_refresh: "attacker-refresh",
				shieldpm_actor_refresh: "attacker-actor",
				[SECURE_ACCESS_COOKIE]: "secure-access",
				[SECURE_REFRESH_COOKIE]: "secure-refresh",
				[SECURE_ACTOR_REFRESH_COOKIE]: "secure-actor",
			},
		};
		expect(getAccessCookie(req)).toBe("secure-access");
		expect(getRefreshCookie(req)).toBe("secure-refresh");
		expect(getActorRefreshCookie(req)).toBe("secure-actor");
	});

	it("never reads Secure cookie names from a plain HTTP request", () => {
		const req = {
			secure: false,
			cookies: {
				[SECURE_ACCESS_COOKIE]: "secure-access",
				[SECURE_REFRESH_COOKIE]: "secure-refresh",
			},
		};
		expect(getAccessCookie(req)).toBeUndefined();
		expect(getRefreshCookie(req)).toBeUndefined();
	});

	it("uses prefix-compatible flags and paths on HTTPS", () => {
		const req = { secure: true, cookies: {} };
		const res = createResponse();
		setAuthCookies(res, req, {
			accessToken: "access",
			accessExpires: new Date(Date.now() + 60_000).toISOString(),
			refreshToken: "refresh",
			refreshExpires: new Date(Date.now() + 120_000).toISOString(),
		});
		setActorRefreshCookie(res, req, "actor", new Date(Date.now() + 120_000).toISOString());

		expect(res.cookie).toHaveBeenCalledWith(
			SECURE_ACCESS_COOKIE,
			"access",
			expect.objectContaining({ httpOnly: true, path: "/", sameSite: "strict", secure: true }),
		);
		expect(res.cookie).toHaveBeenCalledWith(
			SECURE_REFRESH_COOKIE,
			"refresh",
			expect.objectContaining({ httpOnly: true, path: "/api/tokens", sameSite: "strict", secure: true }),
		);
		expect(res.cookie).toHaveBeenCalledWith(
			SECURE_ACTOR_REFRESH_COOKIE,
			"actor",
			expect.objectContaining({ httpOnly: true, path: "/api/tokens", sameSite: "strict", secure: true }),
		);
	});
});
