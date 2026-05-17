import crypto from "node:crypto";
import dayjs from "dayjs";
import { transaction } from "objection";
import db from "../db.js";
import errs from "../lib/error.js";
import { parseDatePeriod } from "../lib/helpers.js";
import AuthSession from "../models/auth-session.js";
import TokenModel from "../models/token.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

const TOKEN_NOT_FOUND_MESSAGE = "Invalid refresh token";
const TOKEN_REVOKED_MESSAGE = "Refresh token has been revoked";
const TOKEN_EXPIRED_MESSAGE = "Refresh token has expired";
const TOKEN_REPLAY_MESSAGE = "Refresh token replay detected";

const sanitizeMeta = (meta = {}) => ({
	created_ip: meta.ip || meta.created_ip || null,
	created_user_agent: meta.userAgent || meta.user_agent || meta.created_user_agent || null,
});

const requireValidTtl = (expression, label) => {
	const parsed = parseDatePeriod(expression);
	if (!parsed) {
		throw new errs.InternalError(`Invalid ${label} TTL configuration: ${expression}`);
	}
	return parsed;
};

const _ACCESS_TOKEN_EXPIRY = requireValidTtl(ACCESS_TOKEN_TTL, "access token");
const _REFRESH_TOKEN_EXPIRY = requireValidTtl(REFRESH_TOKEN_TTL, "refresh token");

const buildRefreshToken = () => crypto.randomBytes(48).toString("base64url");

const buildAccessToken = async (user, scope) => {
	const Token = TokenModel();
	return Token.create({
		iss: "api",
		attrs: {
			id: user.id,
		},
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

const createRefreshSession = async ({
	trx,
	user,
	scope,
	rawRefreshToken,
	familyId,
	parentSessionId = null,
	meta = {},
}) => {
	const session = await AuthSession.query(trx).insertAndFetch({
		user_id: user.id,
		family_id: familyId,
		parent_session_id: parentSessionId,
		token_hash: AuthSession.hashToken(rawRefreshToken),
		scope: AuthSession.normalizeScope(scope),
		expires_at: parseDatePeriod(REFRESH_TOKEN_TTL).format("YYYY-MM-DD HH:mm:ss"),
		...sanitizeMeta(meta),
	});

	return session;
};

const revokeSession = async (sessionId, reason = "revoked", trx = null) => {
	if (!sessionId) {
		throw new errs.ValidationError("sessionId is required");
	}

	const query = AuthSession.query(trx)
		.patch({
			revoked_at: db().fn.now(),
			revoked_reason: reason,
		})
		.where("id", sessionId)
		.whereNull("revoked_at");

	return query;
};

const revokeFamily = async (familyId, reason = "family_revoked", trx = null) => {
	if (!familyId) {
		throw new errs.ValidationError("familyId is required");
	}

	return AuthSession.query(trx)
		.patch({
			revoked_at: db().fn.now(),
			revoked_reason: reason,
		})
		.where("family_id", familyId)
		.whereNull("revoked_at");
};

const issueTokenPair = async (user, scope = "user", meta = {}) => {
	const normalizedScope = AuthSession.normalizeScope(scope);
	const rawRefreshToken = buildRefreshToken();
	const familyId = meta.family_id || meta.familyId || AuthSession.createFamilyId();

	const result = await transaction(AuthSession.knex(), async (trx) => {
		const refreshSession = await createRefreshSession({
			trx,
			user,
			scope: normalizedScope,
			rawRefreshToken,
			familyId,
			meta,
		});

		const accessToken = await buildAccessToken(user, normalizedScope);

		return buildTokenResponse({
			accessToken,
			refreshToken: rawRefreshToken,
			refreshSession,
			user,
		});
	});

	return result;
};

const refreshTokenPair = async (rawRefreshToken, meta = {}) => {
	if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
		throw new errs.AuthError(TOKEN_NOT_FOUND_MESSAGE);
	}

	const lookup = AuthSession.buildLookup(rawRefreshToken);

	return transaction(AuthSession.knex(), async (trx) => {
		const session = await AuthSession.query(trx).findOne(lookup).withGraphFetched("user");

		if (!session) {
			throw new errs.AuthError(TOKEN_NOT_FOUND_MESSAGE);
		}

		if (session.revoked_at) {
			throw new errs.AuthError(TOKEN_REVOKED_MESSAGE);
		}

		if (dayjs(session.expires_at).isBefore(dayjs())) {
			await revokeSession(session.id, "expired_refresh_token", trx);
			throw new errs.AuthError(TOKEN_EXPIRED_MESSAGE);
		}

		if (session.rotated_at || session.replaced_by_session_id) {
			await revokeFamily(session.family_id, "refresh_token_replay_detected", trx);
			throw new errs.UnauthorizedError(TOKEN_REPLAY_MESSAGE);
		}

		const nextRefreshToken = buildRefreshToken();
		const nextSession = await createRefreshSession({
			trx,
			user: session.user,
			scope: session.scope,
			rawRefreshToken: nextRefreshToken,
			familyId: session.family_id,
			parentSessionId: session.id,
			meta,
		});

		const updatedRows = await AuthSession.query(trx)
			.patch({
				rotated_at: db().fn.now(),
				replaced_by_session_id: nextSession.id,
				last_used_at: db().fn.now(),
			})
			.where("id", session.id)
			.whereNull("rotated_at")
			.whereNull("replaced_by_session_id");

		if (updatedRows === 0) {
			await revokeFamily(session.family_id, "refresh_token_rotation_race", trx);
			throw new errs.UnauthorizedError(TOKEN_REPLAY_MESSAGE);
		}

		const accessToken = await buildAccessToken(session.user, session.scope);

		return buildTokenResponse({
			accessToken,
			refreshToken: nextRefreshToken,
			refreshSession: nextSession,
			user: session.user,
		});
	});
};

export default {
	ACCESS_TOKEN_TTL,
	REFRESH_TOKEN_TTL,
	issueTokenPair,
	refreshTokenPair,
	revokeSession,
	revokeFamily,
};
