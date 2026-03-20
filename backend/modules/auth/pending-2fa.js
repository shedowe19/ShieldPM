import TokenModel from "../../models/token.js";
import User from "../../models/user.js";
import UserTwoFa from "../../models/user-2fa.js";

const createPendingTwoFaChallenge = async (userId, csrfToken) => {
	const Token = TokenModel();
	const pending = await Token.create({
		iss: "api",
		attrs: { id: userId },
		scope: ["2fa_pending"],
		expiresIn: "5m",
	});

	const activeMethods = await UserTwoFa.getActiveForUser(userId);
	const methodTypes = [...new Set(activeMethods.map((m) => m.type))];

	return {
		requires_2fa: true,
		pending_token: pending.token,
		methods: methodTypes,
		csrfToken,
	};
};

const loadPendingTwoFaPayload = async (pendingToken) => {
	const Token = TokenModel();
	const payload = await Token.load(pendingToken);
	const scope = payload.scope;
	const scopes = Array.isArray(scope) ? scope : [scope];
	if (!scopes.includes("2fa_pending")) {
		const error = new Error("Invalid token scope for 2FA verification");
		error.status = 401;
		error.public = true;
		throw error;
	}
	const userId = payload.attrs?.id;
	if (!userId) {
		const error = new Error("Invalid pending token");
		error.status = 401;
		error.public = true;
		throw error;
	}
	return payload;
};

const loadPendingTwoFaUser = async (pendingToken) => {
	const payload = await loadPendingTwoFaPayload(pendingToken);
	const userId = payload.attrs.id;
	const user = await User.query().findById(userId).andWhere("is_deleted", 0).andWhere("is_disabled", 0);
	return { payload, userId, user };
};

export { createPendingTwoFaChallenge, loadPendingTwoFaPayload, loadPendingTwoFaUser };
