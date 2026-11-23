import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	grant: vi.fn(),
	load: vi.fn(),
	create: vi.fn(),
	issue: vi.fn(),
	getOauthToken: vi.fn(),
	build: vi.fn(async () => "https://idp.example.com/authorize"),
	user: null,
	usersByEmail: [],
	has2fa: false,
	activeMethods: [],
	hasLocalPassword: false,
	audit: vi.fn(),
	enabled: true,
	settings: null,
}));
vi.mock("openid-client", () => ({
	discovery: async () => ({}),
	randomNonce: () => "nonce",
	randomState: () => "state",
	randomPKCECodeVerifier: () => "verifier",
	calculatePKCECodeChallenge: async (verifier) => `challenge-${verifier}`,
	buildAuthorizationUrl: mocks.build,
	authorizationCodeGrant: mocks.grant,
}));
vi.mock("../../lib/config.js", () => ({ getEncryptionKey: () => "01".repeat(32) }));
vi.mock("../../internal/token.js", () => ({
	default: { issueTokenPair: mocks.issue, getTokenFromOAuthClaim: mocks.getOauthToken },
}));
vi.mock("../../models/token.js", () => ({ default: () => ({ load: mocks.load, create: mocks.create }) }));
vi.mock("../../models/user.js", () => ({
	default: {
		query: () => ({
			whereRaw: () => ({ andWhere: () => ({ limit: async () => mocks.usersByEmail }) }),
			findById: () => ({ where: async () => mocks.user }),
		}),
	},
}));
vi.mock("../../models/user-2fa.js", () => ({
	default: {
		hasActive2FA: async () => mocks.has2fa,
		getActiveForUser: async () => mocks.activeMethods,
	},
}));
vi.mock("../../models/auth.js", () => ({
	default: {
		query: () => {
			const query = {
				where: () => query,
				first: async () => (mocks.hasLocalPassword ? { id: 1, type: "password" } : undefined),
			};
			return query;
		},
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: mocks.audit } }));
vi.mock("../../models/setting.js", () => ({
	default: { query: () => ({ where: () => ({ first: async () => mocks.settings }) }) },
}));
vi.mock("../../logger.js", () => ({ oidc: { info: vi.fn(), error: vi.fn() } }));

import { decrypt, encrypt } from "../../lib/encryption.js";
import router from "../../routes/oidc.js";

const LOGIN_STATE_PURPOSE = "shieldpm:oidc-login:v1";
const handler = (path) => router.stack.find((layer) => layer.route?.path === path).route.stack.at(-1).handle;
const response = () => ({
	cookie: vi.fn(),
	clearCookie: vi.fn(),
	redirect: vi.fn(),
	status: vi.fn().mockReturnThis(),
	send: vi.fn(),
});
const req = ({ cookies = {}, host = "app.example.com", protocol = "https" } = {}) => ({
	cookies,
	headers: {},
	secure: true,
	protocol,
	get: () => host,
	originalUrl: "/api/oidc/callback?code=code&state=state",
	ip: "192.0.2.1",
});
const loginState = (overrides = {}) =>
	encrypt(
		JSON.stringify({
			purpose: LOGIN_STATE_PURPOSE,
			nonce: "nonce",
			state: "state",
			codeVerifier: "verifier",
			expiresAt: Date.now() + 300_000,
			...overrides,
		}),
	);
const handoffState = (token = "jwt-token") => encrypt(`${token}---${new Date(Date.now() + 60_000).toISOString()}`);

describe("OIDC callback binding and session claims", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.enabled = true;
		mocks.settings = {
			meta: {
				enabled: mocks.enabled,
				clientID: "client",
				clientSecret: "secret",
				issuerURL: "https://idp.example.com",
				redirectURL: "https://app.example.com/api/oidc/callback",
			},
		};
		mocks.load.mockResolvedValue({ attrs: { id: 7 }, scope: ["user"] });
		mocks.user = { id: 7, email: "test@example.com", roles: [], is_disabled: 0, is_deleted: 0 };
		mocks.usersByEmail = [mocks.user];
		mocks.has2fa = false;
		mocks.activeMethods = [{ type: "totp" }];
		mocks.hasLocalPassword = false;
		mocks.audit.mockReset();
		mocks.create.mockResolvedValue({ token: "pending-token" });
		mocks.issue.mockResolvedValue({
			access_token: "access",
			refresh_token: "refresh",
			access_expires: new Date(Date.now() + 900000).toISOString(),
			refresh_expires: new Date(Date.now() + 86400000).toISOString(),
			user: { id: 7 },
		});
		mocks.grant.mockResolvedValue({ claims: () => ({ email: "test@example.com", email_verified: true }) });
		mocks.getOauthToken.mockResolvedValue({
			token: "jwt-token",
			expires: new Date(Date.now() + 60000).toISOString(),
		});
	});

	it.each(["/", "/callback", "/claim"])("rejects disabled OIDC at %s", async (path) => {
		mocks.settings.meta.enabled = false;
		const res = response();
		await handler(path)(req({ cookies: { shieldpm_oidc: loginState() } }), res);
		expect(mocks.grant).not.toHaveBeenCalled();
		expect(mocks.issue).not.toHaveBeenCalled();
		if (path === "/claim")
			expect(res.send).toHaveBeenCalledWith({ error: { message: "OIDC authentication is disabled" } });
		else expect(res.redirect).toHaveBeenCalledWith("/login");
	});

	it("rejects an identity provider assertion without a verified email", async () => {
		mocks.grant.mockResolvedValueOnce({
			claims: () => ({ email: "test@example.com", email_verified: false }),
		});
		const res = response();
		await handler("/callback")(req({ cookies: { shieldpm_oidc: loginState() } }), res);
		expect(mocks.getOauthToken).not.toHaveBeenCalled();
		expect(res.redirect).toHaveBeenCalledWith("/login");
		expect(res.cookie).toHaveBeenCalledWith(
			"shieldpm_oidc_error",
			expect.stringContaining("verified"),
			expect.any(Object),
		);
	});

	it("does not auto-link an administrator account that already has a local password", async () => {
		mocks.user.roles = ["admin"];
		mocks.usersByEmail = [mocks.user];
		mocks.hasLocalPassword = true;
		const res = response();
		await handler("/callback")(req({ cookies: { shieldpm_oidc: loginState() } }), res);
		expect(mocks.getOauthToken).not.toHaveBeenCalled();
		expect(res.redirect).toHaveBeenCalledWith("/login");
		expect(res.cookie).toHaveBeenCalledWith(
			"shieldpm_oidc_error",
			expect.stringContaining("administrator"),
			expect.any(Object),
		);
		expect(mocks.audit).toHaveBeenCalledWith(
			null,
			expect.objectContaining({
				action: "user.oidc_link_denied",
				object_type: "user",
				object_id: 7,
				user_id: 7,
				outcome: "denied",
			}),
		);
	});

	it("still links a non-admin account that has a local password", async () => {
		mocks.hasLocalPassword = true;
		await handler("/callback")(req({ cookies: { shieldpm_oidc: loginState() } }), response());
		expect(mocks.getOauthToken).toHaveBeenCalledOnce();
		expect(mocks.audit).toHaveBeenCalledWith(
			null,
			expect.objectContaining({
				action: "oidc.login_succeeded",
				object_type: "auth",
				outcome: "success",
				meta: expect.objectContaining({ stage: "callback" }),
			}),
		);
	});

	it("links an administrator account without a local password", async () => {
		mocks.user.roles = ["admin"];
		mocks.usersByEmail = [mocks.user];
		mocks.hasLocalPassword = false;
		await handler("/callback")(req({ cookies: { shieldpm_oidc: loginState() } }), response());
		expect(mocks.getOauthToken).toHaveBeenCalledOnce();
	});

	it("does not disclose internal provider or database errors to the browser", async () => {
		mocks.grant.mockRejectedValueOnce(new Error("private provider credentials"));
		const callbackResponse = response();
		await handler("/callback")(req({ cookies: { shieldpm_oidc: loginState() } }), callbackResponse);
		expect(callbackResponse.cookie).toHaveBeenCalledWith(
			"shieldpm_oidc_error",
			"OIDC authentication failed",
			expect.any(Object),
		);
		mocks.issue.mockRejectedValueOnce(new Error("private database credentials"));
		const claimResponse = response();
		await handler("/claim")(req({ cookies: { shieldpm_oidc: handoffState() } }), claimResponse);
		expect(claimResponse.send).toHaveBeenCalledWith({ error: { message: "OIDC authentication failed" } });
	});

	it("sends an S256 PKCE challenge and stores the verifier in the encrypted state cookie", async () => {
		const res = response();
		await handler("/")(req(), res);
		expect(mocks.build).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				redirect_uri: "https://app.example.com/api/oidc/callback",
				nonce: "nonce",
				state: "state",
				code_challenge: "challenge-verifier",
				code_challenge_method: "S256",
			}),
		);
		expect(res.cookie).toHaveBeenCalledWith(
			"shieldpm_oidc",
			expect.any(String),
			expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: true, maxAge: 300000 }),
		);
		const cookieValue = res.cookie.mock.calls.find(([name]) => name === "shieldpm_oidc")[1];
		expect(JSON.parse(decrypt(cookieValue))).toMatchObject({
			purpose: LOGIN_STATE_PURPOSE,
			nonce: "nonce",
			state: "state",
			codeVerifier: "verifier",
		});
	});

	it.each([
		{},
		{ shieldpm_oidc: "malformed" },
		{ shieldpm_oidc: "nonce___state" },
		{ shieldpm_oidc: loginState({ codeVerifier: undefined }) },
		{ shieldpm_oidc: loginState({ expiresAt: Date.now() - 1 }) },
	])("rejects missing, malformed or expired login state: %j", async (cookies) => {
		const res = response();
		await handler("/callback")(req({ cookies }), res);
		expect(mocks.grant).not.toHaveBeenCalled();
		expect(res.redirect).toHaveBeenCalledWith("/login");
		expect(res.cookie).toHaveBeenCalledWith(
			"shieldpm_oidc_error",
			expect.stringContaining("OIDC login state"),
			expect.any(Object),
		);
	});

	it("uses the configured redirect URL for the token exchange even when Host is spoofed", async () => {
		await handler("/callback")(
			req({ cookies: { shieldpm_oidc: loginState() }, host: "evil.example", protocol: "http" }),
			response(),
		);
		expect(mocks.grant).toHaveBeenCalledWith(
			{},
			new URL("https://app.example.com/api/oidc/callback?code=code&state=state"),
			{
				expectedNonce: "nonce",
				expectedState: "state",
				pkceCodeVerifier: "verifier",
			},
		);
		const exchangedUrl = mocks.grant.mock.calls[0][1];
		expect(exchangedUrl.host).toBe("app.example.com");
		expect(exchangedUrl.protocol).toBe("https:");
	});

	it("fails cleanly when the redirect URL is not configured", async () => {
		delete mocks.settings.meta.redirectURL;
		const res = response();
		await handler("/")(req(), res);
		expect(mocks.build).not.toHaveBeenCalled();
		expect(res.redirect).toHaveBeenCalledWith("/login");
		expect(res.cookie).toHaveBeenCalledWith(
			"shieldpm_oidc_error",
			expect.stringContaining("redirect URL is not configured"),
			expect.any(Object),
		);
	});

	it("starts a local 2FA step-up instead of issuing an OIDC handoff", async () => {
		mocks.has2fa = true;
		const res = response();
		await handler("/callback")(req({ cookies: { shieldpm_oidc: loginState() } }), res);
		expect(mocks.grant).toHaveBeenCalledOnce();
		expect(mocks.getOauthToken).not.toHaveBeenCalled();
		expect(mocks.create).toHaveBeenCalledWith(
			expect.objectContaining({ attrs: { id: 7 }, scope: ["2fa_pending"], expiresIn: "5m" }),
		);
		expect(res.clearCookie).toHaveBeenCalledWith("shieldpm_oidc");
		expect(res.cookie).toHaveBeenCalledWith("shieldpm_oidc_stepup", expect.any(String), expect.any(Object));
		expect(res.redirect).toHaveBeenCalledWith("/login?stepup=1");
	});

	it("exchanges a pending OIDC step-up cookie for the 2FA challenge", async () => {
		const state = encrypt(
			JSON.stringify({
				purpose: "shieldpm:oidc-stepup:v1",
				token: "pending-token",
				expiresAt: Date.now() + 60_000,
			}),
		);
		mocks.load.mockResolvedValue({ attrs: { id: 7 }, scope: ["2fa_pending"] });
		const res = response();
		res.locals = { csrfToken: "csrf-token" };
		await handler("/step-up")(req({ cookies: { shieldpm_oidc_stepup: state } }), res);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.send).toHaveBeenCalledWith({
			requires_2fa: true,
			pending_token: "pending-token",
			methods: ["totp"],
			csrfToken: "csrf-token",
		});
	});

	it("rejects an expired OIDC step-up cookie", async () => {
		const state = encrypt(
			JSON.stringify({
				purpose: "shieldpm:oidc-stepup:v1",
				token: "pending-token",
				expiresAt: Date.now() - 1,
			}),
		);
		const res = response();
		res.locals = { csrfToken: "csrf-token" };
		await handler("/step-up")(req({ cookies: { shieldpm_oidc_stepup: state } }), res);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.clearCookie).toHaveBeenCalledWith("shieldpm_oidc_stepup");
	});

	it("claims a valid handoff and creates both access and refresh cookies", async () => {
		const res = response();
		await handler("/claim")(req({ cookies: { shieldpm_oidc: handoffState() } }), res);
		expect(mocks.load).toHaveBeenCalledWith("jwt-token");
		expect(mocks.issue).toHaveBeenCalledWith(mocks.user, "user", expect.any(Object));
		expect(res.cookie).toHaveBeenCalledWith("shieldpm_jwt", "access", expect.any(Object));
		expect(res.cookie).toHaveBeenCalledWith(
			"shieldpm_refresh",
			"refresh",
			expect.objectContaining({ path: "/api/tokens" }),
		);
	});

	it("refuses to turn an OIDC handoff into a session when local 2FA is enabled", async () => {
		mocks.has2fa = true;
		const res = response();
		await handler("/claim")(req({ cookies: { shieldpm_oidc: handoffState() } }), res);
		expect(mocks.issue).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.send).toHaveBeenCalledWith({ error: { message: expect.stringContaining("two-factor") } });
	});

	it("refuses a pre-existing handoff for an admin with a local password", async () => {
		mocks.user.roles = ["admin"];
		mocks.hasLocalPassword = true;
		const res = response();
		await handler("/claim")(req({ cookies: { shieldpm_oidc: handoffState() } }), res);
		expect(mocks.issue).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
		expect(mocks.audit).toHaveBeenCalledWith(
			null,
			expect.objectContaining({ action: "user.oidc_link_denied", object_id: 7 }),
		);
	});

	it("does not create a session from an expired encrypted handoff", async () => {
		mocks.load.mockRejectedValueOnce(new Error("Token expired"));
		const res = response();
		await handler("/claim")(req({ cookies: { shieldpm_oidc: handoffState() } }), res);
		expect(mocks.issue).not.toHaveBeenCalled();
		expect(res.cookie).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it("does not accept a login-state cookie as a token handoff", async () => {
		const res = response();
		await handler("/claim")(req({ cookies: { shieldpm_oidc: loginState() } }), res);
		expect(mocks.issue).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(400);
	});
});
