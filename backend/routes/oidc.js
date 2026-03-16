import express from "express";
import rateLimit from "express-rate-limit";
import * as client from "openid-client";
import internalToken from "../internal/token.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { oidc as logger } from "../logger.js";
import settingModel from "../models/setting.js";

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
	.all(jwtdecode())

	/**
	 * GET /api/oidc
	 *
	 * OAuth Authorization Code flow initialisation
	 */
	.get(async (_req, res) => {
		try {
			const settings = await settingModel.query().where({ id: "oidc-config" }).first();
			const params = await getInitParams(settings);
			redirectToAuthorizationURL(res, params);
		} catch (err) {
			redirectWithError(res, err);
		}
	});

router
	.route("/callback")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/oidc/callback
	 *
	 * Oauth Authorization Code flow callback
	 */
	.get(async (req, res) => {
		try {
			const settings = await settingModel.query().where({ id: "oidc-config" }).first();
			const token = await validateCallback(req, settings);
			redirectWithJwtToken(res, token);
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
			if (!req.headers || !req.headers.cookie) {
				throw new errs.AuthError("No cookie provided");
			}

			let encryptedToken;
			const cookies = req.headers.cookie.split(";");
			for (const cookie of cookies) {
				const [name, value] = cookie.split("=");
				if (name.trim() === "shieldpm_oidc") {
					encryptedToken = value;
					break;
				}
			}

			if (!encryptedToken) {
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

			// Decode token to get user ID (without verification, signature is trusted from encryption)
			// We can use the global jwt-decode middleware logic? Or just manual decode since we trust the source (our own encrypted cookie)
			// But better to use library to be safe.
			// Let's assume we import jsonwebtoken or just rely on the fact we just decrypted it.
			// For user ID, we need to parse the base64 payload.
			const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());

			// Set Session Cookie
			res.cookie("shieldpm_jwt", token, {
				httpOnly: true,
				secure: req.secure,
				sameSite: "strict",
				maxAge: new Date(expires).getTime() - Date.now(),
			});

			res.clearCookie("shieldpm_oidc", { secure: true, sameSite: "Strict" });

			// Return user info for AuthStore
			res.status(200).send({
				expires,
				user: { id: payload.attrs.id },
			});
		} catch (err) {
			res.status(400).send({ error: { message: err.message } });
		}
	});

/**
 * Executes discovery and returns the configured `openid-client` client
 *
 * @param {Setting} settings
 * */
const getConfig = async (settings) => {
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
	if (!req.headers || !req.headers.cookie) {
		return { nonce: undefined, state: undefined };
	}
	let nonce;
	let state;
	const cookies = req.headers.cookie.split(";");
	for (const cookie of cookies) {
		if (cookie.split("=")[0].trim() === "shieldpm_oidc") {
			const raw = cookie.split("=")[1];
			const val = raw.split("___");
			nonce = val[0].trim();
			state = val[1].trim();
			break;
		}
	}

	return { nonce, state };
};

/**
 * Executes validation of callback parameters.
 *
 * @param {Request} req
 * @param {Setting} settings
 * @return {Promise} a promise resolving to a jwt token
 * */
const validateCallback = async (req, settings) => {
	const config = await getConfig(settings);
	const { nonce, state } = parseValuesFromCookie(req);
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

const redirectToAuthorizationURL = (res, params) => {
	res.cookie("shieldpm_oidc", `${params.nonce}___${params.state}`, { secure: true, sameSite: "Strict" });
	res.redirect(params.url);
};

const redirectWithJwtToken = (res, token) => {
	const payload = `${token.token}---${token.expires}`;
	const encrypted = encrypt(payload);
	res.cookie("shieldpm_oidc", encrypted, { secure: true, sameSite: "Strict" });
	res.redirect("/login");
};

const redirectWithError = (res, error) => {
	logger.error(`Callback error:  ${error.message}`);
	res.cookie("shieldpm_oidc_error", error.message, { secure: true, sameSite: "Strict" });
	res.redirect("/login");
};

export default router;
