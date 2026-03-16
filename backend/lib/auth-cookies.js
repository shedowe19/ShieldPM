/**
 * Centralized cookie helpers for auth tokens.
 *
 * Access cookie:  `shieldpm_jwt`     – sent on every request (path: /)
 * Refresh cookie: `shieldpm_refresh` – scoped to /api/tokens only
 */

const ACCESS_COOKIE = "shieldpm_jwt";
const REFRESH_COOKIE = "shieldpm_refresh";

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

export { ACCESS_COOKIE, REFRESH_COOKIE };
