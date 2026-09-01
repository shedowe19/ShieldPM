/**
 * Scheme-bound, httpOnly authentication cookie helpers.
 *
 * HTTPS requests exclusively use prefixed Secure cookies. Plain HTTP requests
 * use distinct legacy names for local development. A request never falls back
 * across schemes, preventing a non-Secure cookie from shadowing an HTTPS
 * session after a downgrade or cookie injection.
 */

const LEGACY_ACCESS_COOKIE = "shieldpm_jwt";
const LEGACY_REFRESH_COOKIE = "shieldpm_refresh";
const LEGACY_ACTOR_REFRESH_COOKIE = "shieldpm_actor_refresh";
const SECURE_ACCESS_COOKIE = "__Host-shieldpm_jwt";
const SECURE_REFRESH_COOKIE = "__Secure-shieldpm_refresh";
const SECURE_ACTOR_REFRESH_COOKIE = "__Secure-shieldpm_actor_refresh";

const REFRESH_PATH = "/api/tokens";

const isSecureRequest = (req) => Boolean(req?.secure);
const getCookie = (req, secureName, legacyName) =>
	isSecureRequest(req) ? req.cookies?.[secureName] : req.cookies?.[legacyName];

const getAccessCookie = (req) => getCookie(req, SECURE_ACCESS_COOKIE, LEGACY_ACCESS_COOKIE);
const getRefreshCookie = (req) => getCookie(req, SECURE_REFRESH_COOKIE, LEGACY_REFRESH_COOKIE);
const getActorRefreshCookie = (req) => getCookie(req, SECURE_ACTOR_REFRESH_COOKIE, LEGACY_ACTOR_REFRESH_COOKIE);

const cookieMaxAge = (expires) => (expires ? Math.max(0, new Date(expires).getTime() - Date.now()) : undefined);

const clearCookieVariants = (res, secureName, legacyName, path = "/") => {
	res.clearCookie(secureName, { httpOnly: true, path, sameSite: "strict", secure: true });
	res.clearCookie(legacyName, { httpOnly: true, path, sameSite: "strict", secure: false });
};

/**
 * @param {import("express").Response} res
 * @param {import("express").Request} req
 * @param {Object} tokens
 * @param {string} tokens.accessToken
 * @param {string} tokens.accessExpires
 * @param {string} tokens.refreshToken
 * @param {string} tokens.refreshExpires
 */
const setAuthCookies = (res, req, { accessToken, accessExpires, refreshToken, refreshExpires }) => {
	const secure = isSecureRequest(req);
	const accessName = secure ? SECURE_ACCESS_COOKIE : LEGACY_ACCESS_COOKIE;
	const refreshName = secure ? SECURE_REFRESH_COOKIE : LEGACY_REFRESH_COOKIE;

	// Remove the opposite-scheme names whenever the browser can receive them.
	clearCookieVariants(res, SECURE_ACCESS_COOKIE, LEGACY_ACCESS_COOKIE);
	clearCookieVariants(res, SECURE_REFRESH_COOKIE, LEGACY_REFRESH_COOKIE, REFRESH_PATH);

	res.cookie(accessName, accessToken, {
		httpOnly: true,
		path: "/",
		secure,
		sameSite: "strict",
		maxAge: cookieMaxAge(accessExpires),
	});

	res.cookie(refreshName, refreshToken, {
		httpOnly: true,
		path: REFRESH_PATH,
		secure,
		sameSite: "strict",
		maxAge: cookieMaxAge(refreshExpires),
	});
};

const setAccessCookie = (res, req, accessToken, accessExpires) => {
	const secure = isSecureRequest(req);
	const accessName = secure ? SECURE_ACCESS_COOKIE : LEGACY_ACCESS_COOKIE;
	clearCookieVariants(res, SECURE_ACCESS_COOKIE, LEGACY_ACCESS_COOKIE);
	res.cookie(accessName, accessToken, {
		httpOnly: true,
		path: "/",
		secure,
		sameSite: "strict",
		maxAge: cookieMaxAge(accessExpires),
	});
};

const setActorRefreshCookie = (res, req, refreshToken, refreshExpires) => {
	const secure = isSecureRequest(req);
	const name = secure ? SECURE_ACTOR_REFRESH_COOKIE : LEGACY_ACTOR_REFRESH_COOKIE;
	clearCookieVariants(res, SECURE_ACTOR_REFRESH_COOKIE, LEGACY_ACTOR_REFRESH_COOKIE, REFRESH_PATH);
	res.cookie(name, refreshToken, {
		httpOnly: true,
		path: REFRESH_PATH,
		secure,
		sameSite: "strict",
		maxAge: cookieMaxAge(refreshExpires),
	});
};

const clearAuthCookies = (res) => {
	clearCookieVariants(res, SECURE_ACCESS_COOKIE, LEGACY_ACCESS_COOKIE);
	clearCookieVariants(res, SECURE_REFRESH_COOKIE, LEGACY_REFRESH_COOKIE, REFRESH_PATH);
};

const clearActorRefreshCookie = (res) => {
	clearCookieVariants(res, SECURE_ACTOR_REFRESH_COOKIE, LEGACY_ACTOR_REFRESH_COOKIE, REFRESH_PATH);
};

export {
	clearActorRefreshCookie,
	clearAuthCookies,
	getAccessCookie,
	getActorRefreshCookie,
	getRefreshCookie,
	isSecureRequest,
	LEGACY_ACCESS_COOKIE as ACCESS_COOKIE,
	LEGACY_ACTOR_REFRESH_COOKIE as ACTOR_REFRESH_COOKIE,
	LEGACY_REFRESH_COOKIE as REFRESH_COOKIE,
	SECURE_ACCESS_COOKIE,
	SECURE_ACTOR_REFRESH_COOKIE,
	SECURE_REFRESH_COOKIE,
	setAccessCookie,
	setActorRefreshCookie,
	setAuthCookies,
};
