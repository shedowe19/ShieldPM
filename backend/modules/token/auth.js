import bcrypt from "bcryptjs";
import _ from "lodash";
import errs from "../../lib/error.js";
import { parseDatePeriod } from "../../lib/helpers.js";
import authModel from "../../models/auth.js";
import TokenModel from "../../models/token.js";
import userModel from "../../models/user.js";
import { DUMMY_HASH, ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N } from "./constants.js";

const getTokenFromEmail = async (data, issuer) => {
	const Token = TokenModel();
	data.scope = data.scope || "user";
	data.expiry = data.expiry || "1d";
	const user = await userModel.query().where("email", data.identity.toLowerCase().trim()).andWhere("is_deleted", 0).andWhere("is_disabled", 0).first();
	if (!user) {
		try { await bcrypt.compare(data.secret, DUMMY_HASH); } catch {}
		throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
	}
	const auth = await authModel.query().where("user_id", "=", user.id).where("type", "=", "password").first();
	if (!auth) {
		try { await bcrypt.compare(data.secret, DUMMY_HASH); } catch {}
		throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
	}
	let valid = false;
	try { valid = await auth.verifyPassword(data.secret); } catch {}
	if (!valid) throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
	if (data.scope !== "user" && _.indexOf(user.roles, data.scope) === -1) throw new errs.AuthError(`Invalid scope: ${data.scope}`);
	const expiry = parseDatePeriod(data.expiry);
	if (expiry === null) throw new errs.AuthError(`Invalid expiry time: ${data.expiry}`);
	const signed = await Token.create({ iss: issuer || "api", attrs: { id: user.id }, scope: [data.scope], expiresIn: data.expiry });
	return { token: signed.token, expires: expiry.toISOString(), user: { id: user.id, name: user.name, email: user.email, nickname: user.nickname, avatar: user.avatar, roles: user.roles } };
};

const getTokenFromOAuthClaim = async (data) => {
	const Token = new TokenModel();
	data.scope = "user";
	data.expiry = "1d";
	const user = await userModel.query().where("email", data.identity).andWhere("is_deleted", 0).andWhere("is_disabled", 0).first();
	if (!user) throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
	const expiry = parseDatePeriod(data.expiry);
	if (expiry === null) throw new errs.AuthError(`Invalid expiry time: ${data.expiry}`);
	const signed = await Token.create({ iss: "api", attrs: { id: user.id }, scope: [data.scope], expiresIn: data.expiry });
	return { token: signed.token, expires: expiry.toISOString() };
};

export { getTokenFromEmail, getTokenFromOAuthClaim };
