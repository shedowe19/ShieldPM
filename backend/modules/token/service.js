import authSessionService from "../../internal/auth-session-service.js";
import { getTokenFromEmail, getTokenFromOAuthClaim } from "./auth.js";
import { getFreshToken, getTokenFromUser } from "./issue.js";

export default {
	getTokenFromEmail,
	getTokenFromOAuthClaim,
	getFreshToken,
	getTokenFromUser,
	issueTokenPair: authSessionService.issueTokenPair,
	refreshTokenPair: authSessionService.refreshTokenPair,
	revokeSession: authSessionService.revokeSession,
	revokeFamily: authSessionService.revokeFamily,
};
