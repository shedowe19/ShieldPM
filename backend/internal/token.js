import bcrypt from "bcryptjs";
import _ from "lodash";
import errs from "../lib/error.js";
import authModel from "../models/auth.js";
import userModel from "../models/user.js";
import authSessionService from "./auth-session-service.js";

const ERROR_MESSAGE_INVALID_AUTH = "Invalid email or password";
const ERROR_MESSAGE_INVALID_AUTH_I18N = "error.invalid-auth";

// A real cost-13 hash keeps missing-user and wrong-password paths comparable.
const DUMMY_HASH = "$2b$13$3w5sK5BtNWq/d7D6YQJfj.G2HM4.3roIvbxytInY6p3WiJjLfVdQ6";

const performDummyPasswordCheck = async (secret) => {
	try {
		await bcrypt.compare(secret, DUMMY_HASH);
	} catch {
		// Treat bcrypt failures as an invalid credential while retaining the same public error.
	}
};

const loadPasswordAuth = (userId) =>
	authModel.query().where("user_id", userId).where("type", "password").where("is_deleted", 0).first();

const verifyPasswordRecord = async (auth, secret) => {
	if (!auth) {
		await performDummyPasswordCheck(secret);
		return false;
	}
	try {
		return await auth.verifyPassword(secret);
	} catch {
		return false;
	}
};

const authenticatePassword = async (data) => {
	const identity = typeof data?.identity === "string" ? data.identity.toLowerCase().trim() : "";
	const secret = typeof data?.secret === "string" ? data.secret : "";
	const scope = data?.scope || "user";

	const user = identity
		? await userModel.query().where("email", identity).andWhere("is_deleted", 0).andWhere("is_disabled", 0).first()
		: null;

	if (!user) {
		await performDummyPasswordCheck(secret);
		throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
	}

	const auth = await loadPasswordAuth(user.id);
	if (!(await verifyPasswordRecord(auth, secret))) {
		throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
	}

	if (scope !== "user" && _.indexOf(user.roles, scope) === -1) {
		throw new errs.AuthError(`Invalid scope: ${scope}`);
	}

	return {
		user,
		authentication_methods: ["pwd"],
	};
};

const verifyUserPassword = async (userId, secret) => {
	if (!secret || typeof secret !== "string") {
		throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
	}
	const user = await userModel.query().findById(userId).where("is_deleted", 0).where("is_disabled", 0);
	const auth = user ? await loadPasswordAuth(user.id) : null;
	if (!user || !(await verifyPasswordRecord(auth, secret))) {
		throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
	}
	return user;
};

export default {
	authenticatePassword,
	getFreshToken: (access, _data) => authSessionService.issueAccessTokenForSession(access),
	getTokenFromEmail: authenticatePassword,
	issueImpersonationPair: authSessionService.issueImpersonationPair,
	issueTokenPair: authSessionService.issueTokenPair,
	markSessionRecentlyAuthenticated: authSessionService.markSessionRecentlyAuthenticated,
	refreshTokenPair: authSessionService.refreshTokenPair,
	requireRecentAuthentication: authSessionService.requireRecentAuthentication,
	restoreImpersonation: authSessionService.restoreImpersonation,
	revokeByRefreshToken: authSessionService.revokeByRefreshToken,
	revokeFamily: authSessionService.revokeFamily,
	revokeSession: authSessionService.revokeSession,
	revokeUserSessions: authSessionService.revokeUserSessions,
	verifyUserPassword,
};
