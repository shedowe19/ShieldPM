import { decrypt, encrypt } from "./encryption.js";
import errs from "./error.js";

/**
 * Centralized cookie helpers for auth tokens.
 *
 * Access cookie:  `shieldpm_jwt`     – sent on every request (path: /)
 * Refresh cookie: `shieldpm_refresh` – scoped to /api/tokens only
 */

const ACCESS_COOKIE = "shieldpm_jwt";
const REFRESH_COOKIE = "shieldpm_refresh";
const DUO_COOKIE = "shieldpm_duo";
const DUO_COOKIE_PATH = "/api/tokens/2fa/duo";
const DUO_COOKIE_PURPOSE = "shieldpm:duo-cookie:v1";

const isSecure = (req) => req.secure || req.headers["x-forwarded-proto"] === "https";

/**
 * Set both auth cookies on the response.
 *
 * @param {import("express").Response} res
 * @param {import("express").Request}  req
 * @param {Object} tokens
 * @param {string} tokens.accessToken
 * @param {string} tokens.accessExpires   ISO-8601
 * @param {string} tokens.refreshToken
 * @param {string} tokens.refreshExpires  ISO-8601
 */
export const setAuthCookies = (res, req, { accessToken, accessExpires, refreshToken, refreshExpires }) => {
	const secure = isSecure(req);

	res.cookie(ACCESS_COOKIE, accessToken, {
		httpOnly: true,
		secure,
		sameSite: "strict",
		maxAge: accessExpires ? Math.max(0, new Date(accessExpires).getTime() - Date.now()) : undefined,
	});

	res.cookie(REFRESH_COOKIE, refreshToken, {
		httpOnly: true,
		secure,
		sameSite: "strict",
		path: "/api/tokens",
		maxAge: refreshExpires ? Math.max(0, new Date(refreshExpires).getTime() - Date.now()) : undefined,
	});
};

/**
 * Clear all auth cookies.
 *
 * @param {import("express").Response} res
 */
export const clearAuthCookies = (res) => {
	res.clearCookie(ACCESS_COOKIE);
	res.clearCookie(REFRESH_COOKIE, { path: "/api/tokens" });
};

// The redirect binding must survive a cross-site top-level navigation, but must
// never be readable by JavaScript or shared with another host.
export const setDuoCookie = (res, req, browserToken, expiresAt) => {
	const encrypted = encrypt(JSON.stringify({ purpose: DUO_COOKIE_PURPOSE, browserToken, expiresAt }));
	res.cookie(DUO_COOKIE, encrypted, {
		httpOnly: true,
		secure: req.secure,
		sameSite: "lax",
		path: DUO_COOKIE_PATH,
		maxAge: Math.max(0, expiresAt - Date.now()),
	});
};

/** Read only authenticated, purpose-bound Duo cookies; never accept plaintext. */
export const readDuoCookie = (req) => {
	const cookie = req.cookies?.[DUO_COOKIE];
	if (!cookie) return null;
	try {
		// Bound the encrypted cookie's size in addition to the shared format checks.
		if (typeof cookie !== "string" || !/^[a-f0-9]{24}:(?:[a-f0-9]{2}){1,256}:[a-f0-9]{32}$/.test(cookie)) {
			throw new errs.ValidationError("Invalid Duo cookie format");
		}
		const payload = JSON.parse(decrypt(cookie));
		if (
			payload?.purpose !== DUO_COOKIE_PURPOSE ||
			typeof payload.browserToken !== "string" ||
			!/^[A-Za-z0-9_-]{43}$/.test(payload.browserToken) ||
			!Number.isFinite(payload.expiresAt) ||
			payload.expiresAt <= Date.now()
		) {
			throw new errs.ValidationError("Invalid Duo cookie payload");
		}
		return payload.browserToken;
	} catch {
		throw new errs.ValidationError("Duo login cookie is invalid or expired");
	}
};

export const clearDuoCookie = (res, req) => {
	res.clearCookie(DUO_COOKIE, {
		httpOnly: true,
		secure: req.secure,
		sameSite: "lax",
		path: DUO_COOKIE_PATH,
	});
};

export { ACCESS_COOKIE, DUO_COOKIE, REFRESH_COOKIE };
