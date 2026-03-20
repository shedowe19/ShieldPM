import { setAuthCookies } from "../../lib/auth-cookies.js";

const issueAuthResponse = async ({ internalToken, user, scope = "user", req, res, csrfToken }) => {
	const ip = req.ip || "unknown";
	const meta = { ip, userAgent: req.headers["user-agent"] || null };
	const pair = await internalToken.issueTokenPair(user, scope, meta);

	setAuthCookies(res, req, {
		accessToken: pair.access_token,
		accessExpires: pair.access_expires,
		refreshToken: pair.refresh_token,
		refreshExpires: pair.refresh_expires,
	});

	return {
		expires: pair.access_expires,
		user: pair.user,
		csrfToken,
	};
};

export { issueAuthResponse };
