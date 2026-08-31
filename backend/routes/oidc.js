import crypto from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import * as client from "openid-client";
import internalToken from "../internal/token.js";
import { setAuthCookies } from "../lib/auth-cookies.js";
import { decrypt, encrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { oidc as logger } from "../logger.js";
import OidcFlow from "../models/oidc-flow.js";
import OidcIdentity from "../models/oidc-identity.js";
import settingModel from "../models/setting.js";

const FLOW_TTL_MS = 5 * 60 * 1000;
const LEGACY_FLOW_COOKIE = "shieldpm_oidc_flow";
const SECURE_FLOW_COOKIE = "__Host-shieldpm_oidc_flow";
const LEGACY_CLAIM_COOKIE = "shieldpm_oidc_claim";
const SECURE_CLAIM_COOKIE = "__Host-shieldpm_oidc_claim";

const oidcRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 30,
	message: { error: { code: 429, message: "Too many authorization requests, please try again later." } },
	standardHeaders: true,
	legacyHeaders: false,
});

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });

const cookieName = (req, secureName, legacyName) => (req.secure ? secureName : legacyName);
const readSchemeBoundCookie = (req, secureName, legacyName) => req.cookies?.[cookieName(req, secureName, legacyName)];
const clearCookieVariants = (res, secureName, legacyName) => {
	res.clearCookie(secureName, { httpOnly: true, path: "/", sameSite: "lax", secure: true });
	res.clearCookie(legacyName, { httpOnly: true, path: "/", sameSite: "lax", secure: false });
};
const setSchemeBoundCookie = (req, res, secureName, legacyName, value, maxAge) => {
	clearCookieVariants(res, secureName, legacyName);
	res.cookie(cookieName(req, secureName, legacyName), value, {
		httpOnly: true,
		path: "/",
		sameSite: "lax",
		secure: Boolean(req.secure),
		maxAge,
	});
};

const getSettings = async () => {
	const settings = await settingModel.query().where({ id: "oidc-config" }).first();
	const issuer = settings?.meta?.issuerURL;
	const clientId = settings?.meta?.clientID;
	const clientSecret = settings?.meta?.clientSecret;
	const redirectUri = settings?.meta?.redirectURL;
	if (![issuer, clientId, clientSecret, redirectUri].every((value) => typeof value === "string" && value.trim())) {
		throw new errs.ConfigurationError("OIDC is not completely configured");
	}

	const normalizedIssuer = OidcIdentity.normalizeIssuer(issuer);
	const issuerUrl = new URL(normalizedIssuer);
	const redirectUrl = new URL(redirectUri);
	const issuerIsLocal = ["localhost", "127.0.0.1", "::1"].includes(issuerUrl.hostname);
	const redirectIsLocal = ["localhost", "127.0.0.1", "::1"].includes(redirectUrl.hostname);
	if (issuerUrl.protocol !== "https:" && !(issuerIsLocal && issuerUrl.protocol === "http:")) {
		throw new errs.ConfigurationError("OIDC issuer must use HTTPS");
	}
	if (redirectUrl.protocol !== "https:" && !(redirectIsLocal && redirectUrl.protocol === "http:")) {
		throw new errs.ConfigurationError("OIDC redirect URI must use HTTPS");
	}
	if (redirectUrl.username || redirectUrl.password || redirectUrl.hash) {
		throw new errs.ConfigurationError("OIDC redirect URI is invalid");
	}

	return { settings, normalizedIssuer, redirectUri: redirectUrl.toString() };
};

const getConfig = ({ settings, normalizedIssuer }) =>
	client.discovery(new URL(normalizedIssuer), settings.meta.clientID, settings.meta.clientSecret);

const buildCallbackUrl = (req, configuredRedirectUri) => {
	const callback = new URL(configuredRedirectUri);
	const incoming = new URL(req.originalUrl, configuredRedirectUri);
	callback.search = incoming.search;
	return callback;
};

const beginFlow = async (req, res, purpose, userId = null) => {
	const configuration = await getSettings();
	const oidcConfig = await getConfig(configuration);
	const flowToken = crypto.randomBytes(32).toString("base64url");
	const state = client.randomState();
	const nonce = client.randomNonce();
	const pkceVerifier = client.randomPKCECodeVerifier();
	const pkceChallenge = await client.calculatePKCECodeChallenge(pkceVerifier);

	await OidcFlow.query().delete().where("expires_at", "<", new Date());
	await OidcFlow.query().insert({
		flow_hash: OidcFlow.hash(flowToken),
		state_hash: OidcFlow.hash(state),
		nonce,
		pkce_verifier: encrypt(pkceVerifier),
		purpose,
		user_id: userId,
		redirect_uri: configuration.redirectUri,
		issuer_hash: OidcFlow.hash(configuration.normalizedIssuer),
		expires_at: new Date(Date.now() + FLOW_TTL_MS),
	});

	const authorizationUrl = client.buildAuthorizationUrl(oidcConfig, {
		redirect_uri: configuration.redirectUri,
		scope: "openid email",
		nonce,
		state,
		code_challenge: pkceChallenge,
		code_challenge_method: "S256",
	});
	setSchemeBoundCookie(req, res, SECURE_FLOW_COOKIE, LEGACY_FLOW_COOKIE, flowToken, FLOW_TTL_MS);
	res.setHeader("Cache-Control", "no-store");
	res.redirect(authorizationUrl);
};

const loadAndConsumeFlow = async (req, configuration) => {
	const flowToken = readSchemeBoundCookie(req, SECURE_FLOW_COOKIE, LEGACY_FLOW_COOKIE);
	const state = typeof req.query?.state === "string" ? req.query.state : "";
	if (!flowToken || !state) {
		throw new errs.AuthError("OIDC authorization transaction is missing");
	}

	const flow = await OidcFlow.query().findOne({
		flow_hash: OidcFlow.hash(flowToken),
		state_hash: OidcFlow.hash(state),
	});
	if (
		!flow ||
		flow.consumed_at ||
		new Date(flow.expires_at).getTime() <= Date.now() ||
		flow.issuer_hash !== OidcFlow.hash(configuration.normalizedIssuer) ||
		flow.redirect_uri !== configuration.redirectUri
	) {
		throw new errs.AuthError("OIDC authorization transaction is invalid or expired");
	}

	const consumed = await OidcFlow.query()
		.patch({ consumed_at: new Date() })
		.where("id", flow.id)
		.whereNull("consumed_at")
		.where("expires_at", ">", new Date());
	if (consumed !== 1) {
		throw new errs.AuthError("OIDC authorization transaction was already consumed");
	}
	return flow;
};

const findBoundIdentity = async (identity) => {
	const binding = await OidcIdentity.query()
		.findOne({ binding_hash: identity.binding_hash })
		.withGraphFetched("user");
	if (binding && (binding.issuer !== identity.issuer || binding.subject !== identity.subject)) {
		throw new errs.InternalError("OIDC identity hash collision detected");
	}
	return binding;
};

const validateClaims = (tokens, configuredIssuer) => {
	const claims = tokens.claims();
	if (!claims?.sub || !claims.iss) {
		throw new errs.AuthError("OIDC provider did not return stable issuer and subject claims");
	}
	if (OidcIdentity.normalizeIssuer(claims.iss) !== configuredIssuer) {
		throw new errs.AuthError("OIDC issuer claim does not match the configured provider");
	}
	if (!claims.email || (claims.email_verified !== true && claims.email_verified !== "true")) {
		throw new errs.AuthError("OIDC provider did not return a verified email address");
	}
	return claims;
};

router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(oidcRateLimiter)
	.all(jwtdecode())
	.get(async (req, res) => {
		try {
			const purpose = req.query?.purpose === "link" ? "link" : "login";
			let userId = null;
			if (purpose === "link") {
				const session = await internalToken.requireRecentAuthentication(res.locals.access);
				userId = session.user_id;
			}
			await beginFlow(req, res, purpose, userId);
		} catch (error) {
			logger.error(`OIDC flow initialization failed: ${error.message}`);
			res.redirect("/login?oidc_error=1");
		}
	});

router
	.route("/callback")
	.options((_, res) => res.sendStatus(204))
	.get(async (req, res) => {
		try {
			const configuration = await getSettings();
			const flow = await loadAndConsumeFlow(req, configuration);
			const oidcConfig = await getConfig(configuration);
			const tokens = await client.authorizationCodeGrant(
				oidcConfig,
				buildCallbackUrl(req, configuration.redirectUri),
				{
					expectedNonce: flow.nonce,
					expectedState: req.query.state,
					pkceCodeVerifier: decrypt(flow.pkce_verifier),
				},
			);
			const claims = validateClaims(tokens, configuration.normalizedIssuer);
			const identity = OidcIdentity.buildIdentity(configuration.normalizedIssuer, claims.sub);
			const existingBinding = await findBoundIdentity(identity);

			if (flow.purpose === "link") {
				if (existingBinding && Number(existingBinding.user_id) !== Number(flow.user_id)) {
					throw new errs.PermissionError("This OIDC identity is already linked to another user");
				}
				if (!existingBinding) {
					await OidcIdentity.query().insert({
						...identity,
						user_id: flow.user_id,
						email_at_link: String(claims.email).toLowerCase(),
					});
				}
				clearCookieVariants(res, SECURE_FLOW_COOKIE, LEGACY_FLOW_COOKIE);
				return res.redirect("/profile/security?oidc_linked=1");
			}

			if (!existingBinding) {
				throw new errs.AuthError(
					"OIDC identity is not linked. Sign in locally and start an authenticated OIDC link flow.",
				);
			}
			const user = existingBinding.user;
			if (!user || user.is_deleted || user.is_disabled) {
				throw new errs.AuthError("The linked ShieldPM user is not active");
			}

			await OidcIdentity.query().patchAndFetchById(existingBinding.id, { last_login_at: new Date() });
			const authenticationMethods = ["oidc", ...(Array.isArray(claims.amr) ? claims.amr : [])];
			const claimedAuthTime = Number(claims.auth_time);
			const nowSeconds = Math.floor(Date.now() / 1000);
			if (Number.isFinite(claimedAuthTime) && (claimedAuthTime < 0 || claimedAuthTime > nowSeconds + 60)) {
				throw new errs.AuthError("OIDC authentication time claim is invalid");
			}
			const authTime = Number.isFinite(claimedAuthTime) ? new Date(claimedAuthTime * 1000) : new Date();
			const pair = await internalToken.issueTokenPair(user, "user", {
				ip: req.ip || "unknown",
				userAgent: req.headers["user-agent"] || null,
				authTime,
				authenticationMethods,
			});
			setAuthCookies(res, req, {
				accessToken: pair.access_token,
				accessExpires: pair.access_expires,
				refreshToken: pair.refresh_token,
				refreshExpires: pair.refresh_expires,
			});
			setSchemeBoundCookie(req, res, SECURE_CLAIM_COOKIE, LEGACY_CLAIM_COOKIE, "1", 60_000);
			clearCookieVariants(res, SECURE_FLOW_COOKIE, LEGACY_FLOW_COOKIE);
			logger.info(`Successful OIDC authentication for bound user ${user.id}`);
			return res.redirect("/login");
		} catch (error) {
			clearCookieVariants(res, SECURE_FLOW_COOKIE, LEGACY_FLOW_COOKIE);
			logger.error(`OIDC callback failed: ${error.message}`);
			return res.redirect("/login?oidc_error=1");
		}
	});

router
	.route("/claim")
	.options((_, res) => res.sendStatus(204))
	.post(oidcRateLimiter, jwtdecode(), async (req, res) => {
		try {
			const claim = readSchemeBoundCookie(req, SECURE_CLAIM_COOKIE, LEGACY_CLAIM_COOKIE);
			clearCookieVariants(res, SECURE_CLAIM_COOKIE, LEGACY_CLAIM_COOKIE);
			if (claim !== "1") {
				throw new errs.ValidationError("No pending OIDC login");
			}
			const session = await internalToken.requireRecentAuthentication(res.locals.access, 60_000);
			const user = await UserForClaim(session.user_id);
			const expiry = res.locals.access.token.get("exp");
			return res.status(200).send({
				expires: expiry ? new Date(expiry * 1000).toISOString() : null,
				user: { id: user.id },
				csrfToken: res.locals.issueCsrfTokenForFamily(session.family_id),
			});
		} catch (error) {
			const code = error instanceof errs.ValidationError ? 400 : error.status || 401;
			return res.status(code).send({ error: { code, message: error.message } });
		}
	});

const UserForClaim = async (userId) => {
	const binding = await OidcIdentity.query().findOne({ user_id: userId });
	if (!binding) {
		throw new errs.AuthError("OIDC identity binding is missing");
	}
	return { id: userId };
};

export default router;
