import { parseDatePeriod } from "../../lib/helpers.js";
import AuthSession from "../../models/auth-session.js";
import TokenModel from "../../models/token.js";
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from "./constants.js";

const sanitizeMeta = (meta = {}) => ({
	created_ip: meta.ip || meta.created_ip || null,
	created_user_agent: meta.userAgent || meta.user_agent || meta.created_user_agent || null,
});

const buildAccessToken = async (user, scope) => {
	const Token = TokenModel();
	return Token.create({
		iss: "api",
		attrs: { id: user.id },
		scope: AuthSession.normalizeScope(scope),
		expiresIn: ACCESS_TOKEN_TTL,
	});
};

const buildTokenResponse = ({ accessToken, refreshToken, refreshSession, user }) => ({
	access_token: accessToken.token,
	access_expires: parseDatePeriod(ACCESS_TOKEN_TTL).toISOString(),
	refresh_token: refreshToken,
	refresh_expires: refreshSession.expires_at,
	token_type: "Bearer",
	session: {
		id: refreshSession.id,
		family_id: refreshSession.family_id,
		parent_session_id: refreshSession.parent_session_id,
		scope: refreshSession.scope,
		expires_at: refreshSession.expires_at,
	},
	user: user
		? {
				id: user.id,
				name: user.name,
				email: user.email,
				nickname: user.nickname,
				avatar: user.avatar,
				roles: user.roles,
			}
		: undefined,
});

const createRefreshSession = async ({ trx, user, scope, rawRefreshToken, familyId, parentSessionId = null, meta = {} }) => {
	return AuthSession.query(trx).insertAndFetch({
		user_id: user.id,
		family_id: familyId,
		parent_session_id: parentSessionId,
		token_hash: AuthSession.hashToken(rawRefreshToken),
		scope: AuthSession.normalizeScope(scope),
		expires_at: parseDatePeriod(REFRESH_TOKEN_TTL).format("YYYY-MM-DD HH:mm:ss"),
		...sanitizeMeta(meta),
	});
};

export { buildAccessToken, buildTokenResponse, createRefreshSession, sanitizeMeta };
