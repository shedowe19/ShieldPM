import errs from "../../lib/error.js";
import { parseDatePeriod } from "../../lib/helpers.js";
import TokenModel from "../../models/token.js";

const getFreshToken = async (access, data) => {
	const Token = TokenModel();
	const thisData = data || {};
	thisData.expiry = thisData.expiry || "1d";
	if (access?.token.getUserId(0)) {
		const expiry = parseDatePeriod(thisData.expiry);
		if (expiry === null) throw new errs.AuthError(`Invalid expiry time: ${thisData.expiry}`);
		const token_attrs = { id: access.token.getUserId(0) };
		let scope = access.token.get("scope");
		if (thisData.scope && access.token.hasScope("admin")) {
			scope = [thisData.scope];
			if (thisData.scope === "job-board" || thisData.scope === "worker") token_attrs.id = 0;
		}
		const signed = await Token.create({ iss: "api", scope, attrs: token_attrs, expiresIn: thisData.expiry });
		return { token: signed.token, expires: expiry.toISOString(), user: { id: token_attrs.id } };
	}
	throw new errs.UnauthorizedError("No active session found");
};

const getTokenFromUser = async (user) => {
	const expire = "1d";
	const Token = TokenModel();
	const expiry = parseDatePeriod(expire);
	const signed = await Token.create({ iss: "api", attrs: { id: user.id }, scope: ["user"], expiresIn: expire });
	return { token: signed.token, expires: expiry.toISOString(), user };
};

export { getFreshToken, getTokenFromUser };
