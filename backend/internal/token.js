import bcrypt from "bcryptjs"; // Added for timing attack mitigation
import _ from "lodash";
import errs from "../lib/error.js";
import { parseDatePeriod } from "../lib/helpers.js";
import authModel from "../models/auth.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";
import authSessionService from "./auth-session-service.js";

const ERROR_MESSAGE_INVALID_AUTH = "Invalid email or password";
const ERROR_MESSAGE_INVALID_AUTH_I18N = "error.invalid-auth";

const DUMMY_HASH = "$2a$13$mzC9.T8Qed0f/M9.2v.9JO/1.1.1.1.1.1.1.1.1.1.1.1.1.1"; // Cost 13 (High)

export default {
	/**
	 * @param   {Object} data
	 * @param   {String} data.identity
	 * @param   {String} data.secret
	 * @param   {String} [data.scope]
	 * @param   {String} [data.expiry]
	 * @param   {String} [issuer]
	 * @returns {Promise}
	 */
	getTokenFromEmail: async (data, issuer) => {
		const Token = TokenModel();

		data.scope = data.scope || "user";
		data.expiry = data.expiry || "1d";

		const user = await userModel
			.query()
			.where("email", data.identity.toLowerCase().trim())
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.first();

		if (!user) {
			// Fake work to prevent timing attacks
			try {
				await bcrypt.compare(data.secret, DUMMY_HASH);
			} catch (_err) {
				// Ignore
			}
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
		}

		const auth = await authModel.query().where("user_id", "=", user.id).where("type", "=", "password").first();

		if (!auth) {
			// Fake work to prevent timing attacks
			try {
				await bcrypt.compare(data.secret, DUMMY_HASH);
			} catch (_err) {
				// Ignore
			}
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
		}

		let valid = false;
		try {
			valid = await auth.verifyPassword(data.secret);
		} catch (_err) {
			// Ignore error, treat as invalid password
		}

		if (!valid) {
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH, ERROR_MESSAGE_INVALID_AUTH_I18N);
		}

		if (data.scope !== "user" && _.indexOf(user.roles, data.scope) === -1) {
			// The scope requested doesn't exist as a role against the user,
			// you shall not pass.
			throw new errs.AuthError(`Invalid scope: ${data.scope}`);
		}

		// Create a dayjs object of the expiry expression
		const expiry = parseDatePeriod(data.expiry);
		if (expiry === null) {
			throw new errs.AuthError(`Invalid expiry time: ${data.expiry}`);
		}

		const signed = await Token.create({
			iss: issuer || "api",
			attrs: {
				id: user.id,
			},
			scope: [data.scope],
			expiresIn: data.expiry,
		});

		return {
			token: signed.token,
			expires: expiry.toISOString(),
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				nickname: user.nickname,
				avatar: user.avatar,
				roles: user.roles,
			},
		};
	},

	/**
	 * @param   {any} data
	 * @returns {Promise}
	 */
	getTokenFromOAuthClaim: async (data) => {
		const Token = new /** @type {any} */ (TokenModel)();

		data.scope = "user";
		data.expiry = "1d";

		const user = await userModel
			.query()
			.where("email", data.identity)
			.andWhere("is_deleted", 0)
			.andWhere("is_disabled", 0)
			.first();

		if (!user) {
			throw new errs.AuthError(ERROR_MESSAGE_INVALID_AUTH);
		}

		// Create a dayjs object of the expiry expression
		const expiry = parseDatePeriod(data.expiry);
		if (expiry === null) {
			throw new errs.AuthError(`Invalid expiry time: ${data.expiry}`);
		}

		const signed = await Token.create({
			iss: "api",
			attrs: {
				id: user.id,
			},
			scope: [data.scope],
			expiresIn: data.expiry,
		});

		return {
			token: signed.token,
			expires: expiry.toISOString(),
		};
	},

	/**
	 * @param {import("../lib/types.js").Access} access
	 * @param {Object} [data]
	 * @param {String} [data.expiry]
	 * @param {String} [data.scope]   Only considered if existing token scope is admin
	 * @returns {Promise}
	 */
	getFreshToken: async (access, data) => {
		const Token = TokenModel();
		const thisData = data || {};

		thisData.expiry = thisData.expiry || "1d";

		if (access?.token.getUserId(0)) {
			// Create a dayjs object of the expiry expression
			const expiry = parseDatePeriod(thisData.expiry);
			if (expiry === null) {
				throw new errs.AuthError(`Invalid expiry time: ${thisData.expiry}`);
			}

			const token_attrs = {
				id: access.token.getUserId(0),
			};

			// Only admins can request otherwise scoped tokens
			let scope = access.token.get("scope");
			if (thisData.scope && access.token.hasScope("admin")) {
				scope = [thisData.scope];

				if (thisData.scope === "job-board" || thisData.scope === "worker") {
					token_attrs.id = 0;
				}
			}

			const signed = await Token.create({
				iss: "api",
				scope: scope,
				attrs: token_attrs,
				expiresIn: thisData.expiry,
			});

			return {
				token: signed.token,
				expires: expiry.toISOString(),
				user: {
					id: token_attrs.id,
				},
			};
		}

		throw new errs.UnauthorizedError("No active session found");
	},

	/**
	 * @param   {Object} user
	 * @returns {Promise}
	 */
	getTokenFromUser: async (user) => {
		const expire = "1d";
		const Token = TokenModel();
		const expiry = parseDatePeriod(expire);

		const signed = await Token.create({
			iss: "api",
			attrs: {
				id: user.id,
			},
			scope: ["user"],
			expiresIn: expire,
		});

		return {
			token: signed.token,
			expires: expiry.toISOString(),
			user: user,
		};
	},

	issueTokenPair: authSessionService.issueTokenPair,
	refreshTokenPair: authSessionService.refreshTokenPair,
	revokeSession: authSessionService.revokeSession,
	revokeFamily: authSessionService.revokeFamily,
};
