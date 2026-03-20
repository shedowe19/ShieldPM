import crypto from "node:crypto";
import errs from "../../lib/error.js";
import { parseDatePeriod } from "../../lib/helpers.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

const TOKEN_NOT_FOUND_MESSAGE = "Invalid refresh token";
const TOKEN_REVOKED_MESSAGE = "Refresh token has been revoked";
const TOKEN_EXPIRED_MESSAGE = "Refresh token has expired";
const TOKEN_REPLAY_MESSAGE = "Refresh token replay detected";

const requireValidTtl = (expression, label) => {
	const parsed = parseDatePeriod(expression);
	if (!parsed) {
		throw new errs.InternalError(`Invalid ${label} TTL configuration: ${expression}`);
	}
	return parsed;
};

requireValidTtl(ACCESS_TOKEN_TTL, "access token");
requireValidTtl(REFRESH_TOKEN_TTL, "refresh token");

const buildRefreshToken = () => crypto.randomBytes(48).toString("base64url");

export {
	ACCESS_TOKEN_TTL,
	REFRESH_TOKEN_TTL,
	TOKEN_EXPIRED_MESSAGE,
	TOKEN_NOT_FOUND_MESSAGE,
	TOKEN_REPLAY_MESSAGE,
	TOKEN_REVOKED_MESSAGE,
	buildRefreshToken,
	requireValidTtl,
};
