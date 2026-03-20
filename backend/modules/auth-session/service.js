import dayjs from "dayjs";
import { transaction } from "objection";
import db from "../../db.js";
import errs from "../../lib/error.js";
import AuthSession from "../../models/auth-session.js";
import { buildAccessToken, buildTokenResponse, createRefreshSession } from "./builders.js";
import {
	ACCESS_TOKEN_TTL,
	REFRESH_TOKEN_TTL,
	TOKEN_EXPIRED_MESSAGE,
	TOKEN_NOT_FOUND_MESSAGE,
	TOKEN_REPLAY_MESSAGE,
	TOKEN_REVOKED_MESSAGE,
	buildRefreshToken,
} from "./constants.js";

const revokeSession = async (sessionId, reason = "revoked", trx = null) => {
	if (!sessionId) throw new errs.ValidationError("sessionId is required");
	return AuthSession.query(trx).patch({ revoked_at: db().fn.now(), revoked_reason: reason }).where("id", sessionId).whereNull("revoked_at");
};

const revokeFamily = async (familyId, reason = "family_revoked", trx = null) => {
	if (!familyId) throw new errs.ValidationError("familyId is required");
	return AuthSession.query(trx).patch({ revoked_at: db().fn.now(), revoked_reason: reason }).where("family_id", familyId).whereNull("revoked_at");
};

const issueTokenPair = async (user, scope = "user", meta = {}) => {
	const normalizedScope = AuthSession.normalizeScope(scope);
	const rawRefreshToken = buildRefreshToken();
	const familyId = meta.family_id || meta.familyId || AuthSession.createFamilyId();
	return transaction(AuthSession.knex(), async (trx) => {
		const refreshSession = await createRefreshSession({ trx, user, scope: normalizedScope, rawRefreshToken, familyId, meta });
		const accessToken = await buildAccessToken(user, normalizedScope);
		return buildTokenResponse({ accessToken, refreshToken: rawRefreshToken, refreshSession, user });
	});
};

const refreshTokenPair = async (rawRefreshToken, meta = {}) => {
	if (!rawRefreshToken || typeof rawRefreshToken !== "string") throw new errs.AuthError(TOKEN_NOT_FOUND_MESSAGE);
	const lookup = AuthSession.buildLookup(rawRefreshToken);
	return transaction(AuthSession.knex(), async (trx) => {
		const session = await AuthSession.query(trx).findOne(lookup).withGraphFetched("user");
		if (!session) throw new errs.AuthError(TOKEN_NOT_FOUND_MESSAGE);
		if (session.revoked_at) throw new errs.AuthError(TOKEN_REVOKED_MESSAGE);
		if (dayjs(session.expires_at).isBefore(dayjs())) {
			await revokeSession(session.id, "expired_refresh_token", trx);
			throw new errs.AuthError(TOKEN_EXPIRED_MESSAGE);
		}
		if (session.rotated_at || session.replaced_by_session_id) {
			await revokeFamily(session.family_id, "refresh_token_replay_detected", trx);
			throw new errs.UnauthorizedError(TOKEN_REPLAY_MESSAGE);
		}
		const nextRefreshToken = buildRefreshToken();
		const nextSession = await createRefreshSession({ trx, user: session.user, scope: session.scope, rawRefreshToken: nextRefreshToken, familyId: session.family_id, parentSessionId: session.id, meta });
		const updatedRows = await AuthSession.query(trx)
			.patch({ rotated_at: db().fn.now(), replaced_by_session_id: nextSession.id, last_used_at: db().fn.now() })
			.where("id", session.id)
			.whereNull("rotated_at")
			.whereNull("replaced_by_session_id");
		if (!updatedRows) {
			await revokeFamily(session.family_id, "refresh_token_rotation_race", trx);
			throw new errs.UnauthorizedError(TOKEN_REPLAY_MESSAGE);
		}
		const accessToken = await buildAccessToken(session.user, session.scope);
		return buildTokenResponse({ accessToken, refreshToken: nextRefreshToken, refreshSession: nextSession, user: session.user });
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
