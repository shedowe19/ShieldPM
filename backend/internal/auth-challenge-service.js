import crypto from "node:crypto";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import db from "../db.js";
import errs from "../lib/error.js";
import AuthChallenge from "../models/auth-challenge.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

dayjs.extend(utc);

const issue = async (userId, purpose, meta = {}) => {
	const rawChallenge = crypto.randomBytes(32).toString("base64url");
	const expiresAt = dayjs.utc().add(CHALLENGE_TTL_MS, "millisecond").format("YYYY-MM-DD HH:mm:ss");
	await AuthChallenge.query()
		.patch({ consumed_at: db().fn.now() })
		.where({ user_id: userId, purpose })
		.whereNull("consumed_at");
	await AuthChallenge.query().insert({
		user_id: userId,
		challenge_hash: AuthChallenge.hash(rawChallenge),
		purpose,
		meta,
		expires_at: expiresAt,
	});
	return { token: rawChallenge, expiresAt };
};

const validate = async (rawChallenge, purposes) => {
	if (!rawChallenge || typeof rawChallenge !== "string") {
		throw new errs.AuthError("Authentication challenge is invalid or expired");
	}
	const allowedPurposes = Array.isArray(purposes) ? purposes : [purposes];
	const challenge = await AuthChallenge.query()
		.findOne({ challenge_hash: AuthChallenge.hash(rawChallenge) })
		.whereIn("purpose", allowedPurposes);
	if (!challenge || challenge.consumed_at || dayjs.utc(challenge.expires_at).isBefore(dayjs.utc())) {
		throw new errs.AuthError("Authentication challenge is invalid or expired");
	}
	return challenge;
};

const consume = async (rawChallenge, purpose, expectedUserId) => {
	const challengeHash = AuthChallenge.hash(rawChallenge);
	const query = AuthChallenge.query()
		.patch({ consumed_at: db().fn.now() })
		.where({ challenge_hash: challengeHash, purpose })
		.whereNull("consumed_at")
		.where("expires_at", ">", dayjs.utc().format("YYYY-MM-DD HH:mm:ss"));
	if (expectedUserId) {
		query.where("user_id", expectedUserId);
	}
	const consumedRows = await query;
	if (consumedRows !== 1) {
		throw new errs.AuthError("Authentication challenge was already used or has expired");
	}
	return AuthChallenge.query().findOne({ challenge_hash: challengeHash });
};

export default { CHALLENGE_TTL_MS, consume, issue, validate };
