import authSessionService from "../auth-session/service.js";
import { getTokenFromEmail, getTokenFromOAuthClaim } from "./auth.js";
import { getFreshToken, getTokenFromUser } from "./issue.js";
import TokenModel from "../../models/token.js";

/**
 * Verify and decode a JWT token string.
 * @param {string} rawToken
 * @returns {Promise<object>} decoded payload
 */
const loadToken = async (rawToken) => {
	const Token = TokenModel();
	return Token.load(rawToken);
};

export default {
	getTokenFromEmail,
	getTokenFromOAuthClaim,
	getFreshToken,
	getTokenFromUser,
	loadToken,
	issueTokenPair: authSessionService.issueTokenPair,
	refreshTokenPair: authSessionService.refreshTokenPair,
	revokeSession: authSessionService.revokeSession,
	revokeFamily: authSessionService.revokeFamily,
};
