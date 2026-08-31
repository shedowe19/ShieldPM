import crypto from "node:crypto";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { transaction } from "objection";
import db from "../db.js";
import errs from "../lib/error.js";
import { parseDatePeriod } from "../lib/helpers.js";
import AuthSession from "../models/auth-session.js";
import TokenModel from "../models/token.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";
const REFRESH_ROTATION_GRACE_MS = 15_000;
const RECENT_AUTH_MAX_AGE_MS = 5 * 60 * 1000;

const TOKEN_NOT_FOUND_MESSAGE = "Invalid refresh token";
const TOKEN_REVOKED_MESSAGE = "Refresh token has been revoked";
const TOKEN_EXPIRED_MESSAGE = "Refresh token has expired";
const TOKEN_REPLAY_MESSAGE = "Refresh token replay detected";
const TOKEN_ROTATION_CONFLICT_MESSAGE = "Refresh token was already rotated by a parallel request";
const IMPERSONATION_ACTOR_INVALID_MESSAGE = "Impersonation actor session is no longer authorized";

dayjs.extend(utc);

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

requireValidTtl(ACCESS_TOKEN_TTL, "access token");
requireValidTtl(REFRESH_TOKEN_TTL, "refresh token");

const formatDatabaseDate = (value) => dayjs(value).utc().format("YYYY-MM-DD HH:mm:ss");
const buildRefreshToken = () => crypto.randomBytes(48).toString("base64url");
const normalizeAuthenticationMethods = (methods, fallback = []) => {
	const source = Array.isArray(methods) ? methods : fallback;
	return [
		...new Set(
			source.filter((method) => typeof method === "string" && method.trim()).map((method) => method.trim()),
		),
	];
};

const buildAccessToken = async (user, scope, session) => {
	const Token = TokenModel();
	const payload = {
		iss: "api",
		attrs: {
			id: user.id,
		},
		sid: session.id,
		fid: session.family_id,
		auth_time: session.auth_time ? dayjs.utc(session.auth_time).unix() : undefined,
		amr: normalizeAuthenticationMethods(session.authentication_methods),
		scope: AuthSession.normalizeScope(scope),
		expiresIn: ACCESS_TOKEN_TTL,
	};

	if (session.actor_user_id && session.actor_session_id) {
		payload.act = {
			sub: session.actor_user_id,
			sid: session.actor_session_id,
		};
	}

	return Token.create(payload);
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
		impersonating: Boolean(refreshSession.actor_user_id),
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
	authTime,
	authenticationMethods,
	actorUserId = null,
	actorSessionId = null,
	impersonatedAt = null,
	meta = {},
}) => {
	return AuthSession.query(trx).insertAndFetch({
		user_id: user.id,
		family_id: familyId,
		parent_session_id: parentSessionId,
		token_hash: AuthSession.hashToken(rawRefreshToken),
		scope: AuthSession.normalizeScope(scope),
		expires_at: formatDatabaseDate(parseDatePeriod(REFRESH_TOKEN_TTL)),
		auth_time: authTime ? formatDatabaseDate(authTime) : null,
		authentication_methods: normalizeAuthenticationMethods(authenticationMethods),
		actor_user_id: actorUserId,
		actor_session_id: actorSessionId,
		impersonated_at: impersonatedAt ? formatDatabaseDate(impersonatedAt) : null,
		...sanitizeMeta(meta),
	});
};

const revokeSession = async (sessionId, reason = "revoked", trx = null) => {
	if (!sessionId) {
		throw new errs.ValidationError("sessionId is required");
	}

	return AuthSession.query(trx)
		.patch({
			revoked_at: db().fn.now(),
			revoked_reason: reason,
		})
		.where("id", sessionId)
		.whereNull("revoked_at");
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

const revokeUserSessions = async (userId, reason = "user_sessions_revoked", exceptSessionId = null, trx = null) => {
	const query = AuthSession.query(trx)
		.patch({
			revoked_at: db().fn.now(),
			revoked_reason: reason,
		})
		.where("user_id", userId)
		.whereNull("revoked_at");

	if (exceptSessionId) {
		query.whereNot("id", exceptSessionId);
	}

	return query;
};

const issueTokenPair = async (user, scope = "user", meta = {}) => {
	const normalizedScope = AuthSession.normalizeScope(scope);
	const rawRefreshToken = buildRefreshToken();
	const familyId = meta.family_id || meta.familyId || AuthSession.createFamilyId();
	const authTime = meta.authTime || meta.auth_time || new Date();
	const authenticationMethods = normalizeAuthenticationMethods(
		meta.authenticationMethods || meta.authentication_methods,
		["pwd"],
	);

	return transaction(AuthSession.knex(), async (trx) => {
		const refreshSession = await createRefreshSession({
			trx,
			user,
			scope: normalizedScope,
			rawRefreshToken,
			familyId,
			authTime,
			authenticationMethods,
			meta,
		});
		const accessToken = await buildAccessToken(user, normalizedScope, refreshSession);

		return buildTokenResponse({
			accessToken,
			refreshToken: rawRefreshToken,
			refreshSession,
			user,
		});
	});
};

const loadRefreshSession = (trx, rawRefreshToken) =>
	AuthSession.query(trx).findOne(AuthSession.buildLookup(rawRefreshToken)).withGraphFetched("user");

const isRotationWithinGrace = (session) => {
	if (!session.rotated_at) {
		return false;
	}
	const rotatedAt = dayjs.utc(session.rotated_at);
	return rotatedAt.isValid() && Date.now() - rotatedAt.valueOf() <= REFRESH_ROTATION_GRACE_MS;
};

const getRefreshSessionFailure = async (session, trx) => {
	if (!session) {
		return { kind: "not_found" };
	}
	if (session.revoked_at) {
		return { kind: "revoked" };
	}
	if (dayjs.utc(session.expires_at).isBefore(dayjs.utc())) {
		await revokeSession(session.id, "expired_refresh_token", trx);
		return { kind: "expired" };
	}
	if (session.rotated_at || session.replaced_by_session_id) {
		if (isRotationWithinGrace(session)) {
			return { kind: "conflict" };
		}
		await revokeFamily(session.family_id, "refresh_token_replay_detected", trx);
		return { kind: "replay" };
	}
	return null;
};

const getImpersonationActorFailure = async (session, trx = null) => {
	const actorUserId = Number(session?.actor_user_id || 0);
	const actorSessionId = Number(session?.actor_session_id || 0);
	if (!actorUserId && !actorSessionId) {
		return null;
	}
	if (!actorUserId || !actorSessionId) {
		return { kind: "actor_invalid" };
	}

	const actorSession = await AuthSession.query(trx).findById(actorSessionId).withGraphFetched("user");
	const actor = actorSession?.user;
	const actorRoles = Array.isArray(actor?.roles) ? actor.roles : [];
	const actorScope = AuthSession.normalizeScope(actorSession?.scope || []);
	const actorSessionExpired = !actorSession?.expires_at || dayjs.utc(actorSession.expires_at).isBefore(dayjs.utc());
	const actorSessionInactive = Boolean(
		!actorSession ||
			actorSession.revoked_at ||
			actorSession.rotated_at ||
			actorSession.replaced_by_session_id ||
			actorSession.actor_user_id ||
			actorSessionExpired,
	);
	const actorIdentityInvalid = Boolean(
		!actor || Number(actorSession?.user_id || 0) !== actorUserId || actor.is_deleted || actor.is_disabled,
	);
	// users:loginas is currently granted only by the admin role and user scope.
	// Re-evaluate both on every target access/refresh so authorization removal
	// immediately terminates the linked impersonation family.
	const actorPermissionInvalid = !actorScope.includes("user") || !actorRoles.includes("admin");

	return actorSessionInactive || actorIdentityInvalid || actorPermissionInvalid ? { kind: "actor_invalid" } : null;
};

const createRotationResult = async (trx, session, meta) => {
	const updatedRows = await AuthSession.query(trx)
		.patch({
			rotated_at: db().fn.now(),
			last_used_at: db().fn.now(),
		})
		.where("id", session.id)
		.whereNull("rotated_at")
		.whereNull("replaced_by_session_id")
		.whereNull("revoked_at");

	if (updatedRows === 0) {
		// A losing compare-and-swap may still be reading a transaction snapshot
		// from before the winner committed. Treat it as a benign parallel request;
		// a later request that starts after commit observes rotated_at and follows
		// the grace/replay branch in refreshTokenPair.
		return { kind: "conflict" };
	}

	const nextRefreshToken = buildRefreshToken();
	const nextSession = await createRefreshSession({
		trx,
		user: session.user,
		scope: session.scope,
		rawRefreshToken: nextRefreshToken,
		familyId: session.family_id,
		parentSessionId: session.id,
		authTime: session.auth_time,
		authenticationMethods: session.authentication_methods,
		actorUserId: session.actor_user_id,
		actorSessionId: session.actor_session_id,
		impersonatedAt: session.impersonated_at,
		meta,
	});

	await AuthSession.query(trx).patch({ replaced_by_session_id: nextSession.id }).where("id", session.id);
	const accessToken = await buildAccessToken(session.user, session.scope, nextSession);

	return {
		kind: "success",
		pair: buildTokenResponse({
			accessToken,
			refreshToken: nextRefreshToken,
			refreshSession: nextSession,
			user: session.user,
		}),
	};
};

const throwRefreshResult = (result) => {
	if (result.kind === "not_found") {
		throw new errs.UnauthorizedError(TOKEN_NOT_FOUND_MESSAGE);
	}
	if (result.kind === "revoked") {
		throw new errs.UnauthorizedError(TOKEN_REVOKED_MESSAGE);
	}
	if (result.kind === "expired") {
		throw new errs.UnauthorizedError(TOKEN_EXPIRED_MESSAGE);
	}
	if (result.kind === "conflict") {
		const error = new errs.ConflictError(TOKEN_ROTATION_CONFLICT_MESSAGE);
		error.preserveAuthCookies = true;
		throw error;
	}
	if (result.kind === "replay") {
		throw new errs.UnauthorizedError(TOKEN_REPLAY_MESSAGE);
	}
	if (result.kind === "actor_invalid") {
		throw new errs.UnauthorizedError(IMPERSONATION_ACTOR_INVALID_MESSAGE);
	}
	return result.pair;
};

const refreshTokenPair = async (rawRefreshToken, meta = {}) => {
	if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
		throw new errs.UnauthorizedError(TOKEN_NOT_FOUND_MESSAGE);
	}

	const result = await transaction(AuthSession.knex(), async (trx) => {
		const session = await loadRefreshSession(trx, rawRefreshToken);
		const failure = await getRefreshSessionFailure(session, trx);
		if (failure) {
			return failure;
		}
		const actorFailure = await getImpersonationActorFailure(session, trx);
		if (actorFailure) {
			await revokeFamily(session.family_id, "impersonation_actor_invalid", trx);
			return actorFailure;
		}
		return createRotationResult(trx, session, meta);
	});

	return throwRefreshResult(result);
};

const validateAccessSession = async (sessionId, userId, claims = {}) => {
	if (!Number.isInteger(Number(sessionId)) || !Number.isInteger(Number(userId))) {
		throw new errs.AuthError("Access token is not bound to a valid session");
	}

	const session = await AuthSession.query().findById(Number(sessionId));
	if (!session || Number(session.user_id) !== Number(userId) || session.revoked_at) {
		throw new errs.AuthError("Access session is no longer active");
	}
	if (dayjs.utc(session.expires_at).isBefore(dayjs.utc())) {
		throw new errs.AuthError("Access session has expired");
	}
	if (claims.fid && claims.fid !== session.family_id) {
		throw new errs.AuthError("Access token session family mismatch");
	}

	const tokenActorUserId = claims.act?.sub ? Number(claims.act.sub) : null;
	const tokenActorSessionId = claims.act?.sid ? Number(claims.act.sid) : null;
	if (
		Number(session.actor_user_id || 0) !== Number(tokenActorUserId || 0) ||
		Number(session.actor_session_id || 0) !== Number(tokenActorSessionId || 0)
	) {
		throw new errs.AuthError("Access token impersonation context mismatch");
	}
	const actorFailure = await getImpersonationActorFailure(session);
	if (actorFailure) {
		await revokeFamily(session.family_id, "impersonation_actor_invalid");
		throw new errs.AuthError(IMPERSONATION_ACTOR_INVALID_MESSAGE);
	}

	return session;
};

const getSessionForAccess = async (access) => {
	const sessionId = Number(access?.token?.get("sid") || 0);
	const userId = Number(access?.token?.getUserId?.(0) || 0);
	return validateAccessSession(sessionId, userId, {
		fid: access?.token?.get("fid"),
		act: access?.token?.get("act"),
	});
};

const requireRecentAuthentication = async (access, maxAgeMs = RECENT_AUTH_MAX_AGE_MS) => {
	const session = await getSessionForAccess(access);
	if (session.actor_user_id) {
		throw new errs.PermissionError("This action is not allowed while impersonating another user");
	}
	const authTime = session.auth_time ? dayjs.utc(session.auth_time) : null;
	const hasValidAuthTime = Boolean(authTime?.isValid());
	const ageMs = hasValidAuthTime ? Date.now() - authTime.valueOf() : Number.POSITIVE_INFINITY;
	if (!hasValidAuthTime || ageMs < -60_000 || ageMs > maxAgeMs) {
		throw new errs.AuthError("Recent authentication is required");
	}
	return session;
};

const markSessionRecentlyAuthenticated = async (access, authenticationMethods) => {
	const session = await getSessionForAccess(access);
	if (session.actor_user_id) {
		throw new errs.PermissionError("Step-up authentication is not allowed during impersonation");
	}
	const authTime = new Date();
	const methods = normalizeAuthenticationMethods(authenticationMethods, session.authentication_methods);
	const updated = await AuthSession.query().patchAndFetchById(session.id, {
		auth_time: formatDatabaseDate(authTime),
		authentication_methods: methods,
	});
	const user = await updated.$relatedQuery("user");
	const accessToken = await buildAccessToken(user, updated.scope, updated);
	return {
		token: accessToken.token,
		expires: parseDatePeriod(ACCESS_TOKEN_TTL).toISOString(),
		user: { id: user.id },
	};
};

const issueAccessTokenForSession = async (access) => {
	const session = await getSessionForAccess(access);
	const user = await session.$relatedQuery("user");
	if (!user || user.is_deleted || user.is_disabled) {
		throw new errs.AuthError("Session user is no longer active");
	}
	const accessToken = await buildAccessToken(user, session.scope, session);
	return {
		token: accessToken.token,
		expires: parseDatePeriod(ACCESS_TOKEN_TTL).toISOString(),
		user: { id: user.id },
	};
};

const issueImpersonationPair = async ({ actorSessionId, actorUserId, targetUser, meta = {} }) => {
	if (!actorSessionId || !actorUserId || !targetUser?.id) {
		throw new errs.AuthError("An active actor session is required for impersonation");
	}

	const result = await transaction(AuthSession.knex(), async (trx) => {
		const actorSession = await AuthSession.query(trx).findById(actorSessionId).withGraphFetched("user");
		if (!actorSession || Number(actorSession.user_id) !== Number(actorUserId)) {
			return { kind: "not_found" };
		}
		const actorFailure = await getRefreshSessionFailure(actorSession, trx);
		if (actorFailure) {
			return actorFailure;
		}
		if (actorSession.actor_user_id) {
			throw new errs.PermissionError("Nested impersonation is not allowed");
		}
		if (
			!actorSession.auth_time ||
			Date.now() - dayjs.utc(actorSession.auth_time).valueOf() > RECENT_AUTH_MAX_AGE_MS
		) {
			throw new errs.AuthError("Recent authentication is required before impersonation");
		}

		const actorRotation = await createRotationResult(trx, actorSession, meta);
		if (actorRotation.kind !== "success") {
			return actorRotation;
		}
		// Rotation creates the hidden actor refresh session. Revoking the old
		// node also invalidates the actor access token that was visible before
		// impersonation, so only the target context remains usable in-browser.
		await revokeSession(actorSession.id, "impersonation_started", trx);

		const targetRefreshToken = buildRefreshToken();
		const targetSession = await createRefreshSession({
			trx,
			user: targetUser,
			scope: "user",
			rawRefreshToken: targetRefreshToken,
			familyId: AuthSession.createFamilyId(),
			authTime: actorSession.auth_time,
			authenticationMethods: [
				...normalizeAuthenticationMethods(actorSession.authentication_methods),
				"impersonation",
			],
			actorUserId: actorSession.user_id,
			actorSessionId: actorRotation.pair.session.id,
			impersonatedAt: new Date(),
			meta,
		});
		const targetAccessToken = await buildAccessToken(targetUser, "user", targetSession);

		return {
			kind: "success",
			pair: buildTokenResponse({
				accessToken: targetAccessToken,
				refreshToken: targetRefreshToken,
				refreshSession: targetSession,
				user: targetUser,
			}),
			actor: actorRotation.pair,
		};
	});

	if (result.kind !== "success") {
		return throwRefreshResult(result);
	}
	return { pair: result.pair, actor: result.actor };
};

const restoreImpersonation = async ({ targetRefreshToken, actorRefreshToken, meta = {} }) => {
	if (!targetRefreshToken || !actorRefreshToken) {
		throw new errs.AuthError("No impersonation session is available to restore");
	}

	const result = await transaction(AuthSession.knex(), async (trx) => {
		const [targetSession, actorSession] = await Promise.all([
			loadRefreshSession(trx, targetRefreshToken),
			loadRefreshSession(trx, actorRefreshToken),
		]);
		if (!targetSession || !actorSession) {
			return { kind: "not_found" };
		}
		if (
			!targetSession.actor_user_id ||
			!targetSession.actor_session_id ||
			Number(targetSession.actor_user_id) !== Number(actorSession.user_id) ||
			Number(targetSession.actor_session_id) !== Number(actorSession.id) ||
			actorSession.actor_user_id
		) {
			throw new errs.AuthError("Impersonation restoration context does not match the current session");
		}
		const targetFailure = await getRefreshSessionFailure(targetSession, trx);
		if (targetFailure) {
			return targetFailure;
		}
		const actorFailure = await getRefreshSessionFailure(actorSession, trx);
		if (actorFailure) {
			return actorFailure;
		}

		const actorRotation = await createRotationResult(trx, actorSession, meta);
		if (actorRotation.kind !== "success") {
			return actorRotation;
		}

		await revokeSession(actorSession.id, "impersonation_restored", trx);
		await revokeFamily(targetSession.family_id, "impersonation_restored", trx);
		return actorRotation;
	});

	return throwRefreshResult(result);
};

const revokeByRefreshToken = async (rawRefreshToken, reason = "logout") => {
	if (!rawRefreshToken) {
		return 0;
	}
	const session = await AuthSession.query().findOne(AuthSession.buildLookup(rawRefreshToken));
	return session ? revokeFamily(session.family_id, reason) : 0;
};

export default {
	ACCESS_TOKEN_TTL,
	RECENT_AUTH_MAX_AGE_MS,
	REFRESH_ROTATION_GRACE_MS,
	REFRESH_TOKEN_TTL,
	getSessionForAccess,
	issueAccessTokenForSession,
	issueImpersonationPair,
	issueTokenPair,
	markSessionRecentlyAuthenticated,
	refreshTokenPair,
	requireRecentAuthentication,
	restoreImpersonation,
	revokeByRefreshToken,
	revokeFamily,
	revokeSession,
	revokeUserSessions,
	validateAccessSession,
};
