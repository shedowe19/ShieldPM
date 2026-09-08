import express from "express";
import rateLimit from "express-rate-limit";
import * as client from "openid-client";
import internalToken from "../internal/token.js";
import { clearAuthCookies, clearDuoCookie, setAuthCookies } from "../lib/auth-cookies.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import { oidc as logger } from "../logger.js";
import settingModel from "../models/setting.js";
import TokenModel from "../models/token.js";
import userModel from "../models/user.js";

// Set up rate limiter: for example, 100 requests per 15 minutes per IP
const oidcRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	message: { error: "Too many authorization requests from this IP, please try again later." },
});

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(oidcRateLimiter)

	/**
	 * GET /api/oidc
	 *
	 * OAuth Authorization Code flow initialisation
	 */
	.get(async (req, res) => {
		try {
			const settings = await settingModel.query().where({ id: "oidc-config" }).first();
			const params = await getInitParams(settings);
			redirectToAuthorizationURL(req, res, params);
		} catch (err) {
			redirectWithError(res, err);
		}
	});

router
	.route("/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})

	/**
	 * GET /api/oidc/callback
	 *
	 * Oauth Authorization Code flow callback
	 */
	.get(async (req, res) => {
		try {
			const settings = await settingModel.query().where({ id: "oidc-config" }).first();
			const token = await validateCallback(req, settings);
			redirectWithJwtToken(req, res, token);
		} catch (err) {
			redirectWithError(res, err);
		}
	});

router
	.route("/claim")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(oidcRateLimiter)
	.post(async (req, res) => {
		try {
			assertEnabled(await settingModel.query().where({ id: "oidc-config" }).first());
			const encryptedToken = req.cookies?.shieldpm_oidc;
			if (typeof encryptedToken !== "string" || !encryptedToken) {
				throw new errs.AuthError("No OIDC cookie found");
			}

			let decrypted;
			try {
				decrypted = decrypt(encryptedToken);
			} catch (_e) {
				throw new errs.AuthError("Invalid OIDC cookie");
			}

			const [token, expires] = decrypted.split("---");

			if (!token || !expires) {
				throw new errs.AuthError("Invalid token data in cookie");
			}

			const payload = await TokenModel().load(token);
			if (!payload.scope?.includes("user") || !Number.isSafeInteger(payload.attrs?.id)) {
				throw new errs.AuthError("Invalid OIDC token");
			}
			const user = await userModel.query().findById(payload.attrs.id).where({ is_deleted: 0, is_disabled: 0 });
			if (!user) {
				throw new errs.AuthError("User cannot be loaded for OIDC token");
			}
			const pair = await internalToken.issueTokenPair(user, "user", {
				ip: req.ip,
				userAgent: req.headers["user-agent"],
			});
			setAuthCookies(res, req, {
				accessToken: pair.access_token,
				accessExpires: pair.access_expires,
				refreshToken: pair.refresh_token,
				refreshExpires: pair.refresh_expires,
			});
			res.clearCookie("shieldpm_oidc");
			res.status(200).send({ expires: pair.access_expires, user: pair.user });
		} catch (err) {
			res.status(400).send({ error: { message: err.public ? err.message : "OIDC authentication failed" } });
		}
	});

/**
 * Executes discovery and returns the configured `openid-client` client
 *
 * @param {Setting} settings
 * */
const assertEnabled = (settings) => {
	if (settings?.meta?.enabled !== true) {
		throw new errs.AuthError("OIDC authentication is disabled");
	}
};

const getConfig = async (settings) => {
	assertEnabled(settings);
	return await client.discovery(new URL(settings.meta.issuerURL), settings.meta.clientID, settings.meta.clientSecret);
};

/**
 * Generates nonce, state and authorization url.
 *
 * @param {Setting} settings
 * @return { {String}, {String}, {String} } nonce, state and authorization url
 * */
const getInitParams = async (settings) => {
	const config = await getConfig(settings);

	const nonce = client.randomNonce();
	const state = client.randomState();

	const parameters = {
		redirect_uri: settings.meta.redirectURL,
		scope: "openid email",
		nonce: nonce,
		state: state,
	};

	const url = await client.buildAuthorizationUrl(config, parameters);

	return { url, nonce, state };
};

/**
 * Parses nonce, state and from cookie during the callback phase.
 *
 * @param {Request} req
 * @return { {String}, {String} } nonce and state
 * */
const parseValuesFromCookie = (req) => {
	const raw = req.cookies?.shieldpm_oidc;
	if (typeof raw !== "string") {
		throw new errs.AuthError("Missing OIDC login state. Please restart login.");
	}
	const values = raw.split("___");
	if (values.length !== 2 || !values[0] || !values[1]) {
		throw new errs.AuthError("Invalid OIDC login state. Please restart login.");
	}
	return { nonce: values[0], state: values[1] };
};

/**
 * Executes validation of callback parameters.
 *
 * @param {Request} req
 * @param {Setting} settings
 * @return {Promise} a promise resolving to a jwt token
 * */
const validateCallback = async (req, settings) => {
	const { nonce, state } = parseValuesFromCookie(req);
	const config = await getConfig(settings);
	const currentUrl = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);
	const tokens = await client.authorizationCodeGrant(config, currentUrl, {
		expectedNonce: nonce,
		expectedState: state,
	});
	const claims = tokens.claims();

	if (!claims.email) {
		throw new errs.AuthError("The Identity Provider didn't send the 'email' claim");
	}

	if (claims.email_verified !== true && claims.email_verified !== "true") {
		throw new errs.AuthError("The Identity Provider has not verified the email address");
	}
	logger.info(`Successful authentication for email ${claims.email.toLowerCase()}`);

	return internalToken.getTokenFromOAuthClaim({ identity: claims.email.toLowerCase() });
};

const redirectToAuthorizationURL = (req, res, params) => {
	res.cookie("shieldpm_oidc", `${params.nonce}___${params.state}`, {
		httpOnly: true,
		secure: req.secure,
		sameSite: "lax",
		maxAge: 5 * 60 * 1000,
	});
	res.redirect(params.url);
};

const redirectWithJwtToken = (req, res, token) => {
	const payload = `${token.token}---${token.expires}`;
	const encrypted = encrypt(payload);
	// The verified OIDC login replaces this browser's previous session. Otherwise
	// startup refresh would restore the old identity before the claim can run.
	clearAuthCookies(res);
	clearDuoCookie(res, req);
	res.clearCookie("shieldpm_jwt_original");
	res.cookie("shieldpm_oidc", encrypted, {
		httpOnly: true,
		secure: req.secure,
		sameSite: "lax",
		maxAge: 5 * 60 * 1000,
	});
	res.redirect("/");
};

const redirectWithError = (res, error) => {
	logger.error(`Callback error:  ${error.message}`);
	res.cookie("shieldpm_oidc_error", error.public ? error.message : "OIDC authentication failed", {
		secure: true,
		sameSite: "Strict",
	});
	res.redirect("/login");
};

export default router;
