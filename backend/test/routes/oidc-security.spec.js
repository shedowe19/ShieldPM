import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	grant: vi.fn(),
	load: vi.fn(),
	issue: vi.fn(),
	decrypt: vi.fn(),
	getOauthToken: vi.fn(),
	user: null,
	enabled: true,
}));
vi.mock("openid-client", () => ({
	discovery: async () => ({}),
	randomNonce: () => "nonce",
	randomState: () => "state",
	buildAuthorizationUrl: async () => "https://idp.example.com/authorize",
	authorizationCodeGrant: mocks.grant,
}));
vi.mock("../../internal/token.js", () => ({
	default: { issueTokenPair: mocks.issue, getTokenFromOAuthClaim: mocks.getOauthToken },
}));
vi.mock("../../models/token.js", () => ({ default: () => ({ load: mocks.load }) }));
vi.mock("../../models/user.js", () => ({
	default: { query: () => ({ findById: () => ({ where: async () => mocks.user }) }) },
}));
vi.mock("../../models/setting.js", () => ({
	default: {
		query: () => ({
			where: () => ({
				first: async () => ({
					meta: {
						enabled: mocks.enabled,
						issuerURL: "https://idp.example.com",
						redirectURL: "https://app.example.com/api/oidc/callback",
					},
				}),
			}),
		}),
	},
}));
vi.mock("../../lib/encryption.js", () => ({ decrypt: mocks.decrypt, encrypt: () => "encrypted-token" }));
vi.mock("../../logger.js", () => ({ oidc: { info: vi.fn(), error: vi.fn() } }));

import router from "../../routes/oidc.js";

const handler = (path) => router.stack.find((layer) => layer.route?.path === path).route.stack.at(-1).handle;
const response = () => ({
	cookie: vi.fn(),
	clearCookie: vi.fn(),
	redirect: vi.fn(),
	status: vi.fn().mockReturnThis(),
	send: vi.fn(),
});
const req = (cookies = {}) => ({
	cookies,
	headers: {},
	secure: true,
	protocol: "https",
	get: () => "app.example.com",
	originalUrl: "/api/oidc/callback?code=code&state=state",
});

describe("OIDC callback binding and session claims", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.enabled = true;
		mocks.decrypt.mockReturnValue(`jwt-token---${new Date(Date.now() + 60000).toISOString()}`);
		mocks.load.mockResolvedValue({ attrs: { id: 7 }, scope: ["user"] });
		mocks.user = { id: 7, email: "test@example.com" };
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
		mocks.enabled = false;
		const res = response();
		await handler(path)(req({ shieldpm_oidc: "nonce___state" }), res);
		expect(mocks.grant).not.toHaveBeenCalled();
		expect(mocks.issue).not.toHaveBeenCalled();
		if (path === "/claim")
			expect(res.send).toHaveBeenCalledWith({ error: { message: "OIDC authentication is disabled" } });
		else expect(res.redirect).toHaveBeenCalledWith("/login");
	});

	it("does not disclose internal provider or database errors to the browser", async () => {
		mocks.grant.mockRejectedValueOnce(new Error("private provider credentials"));
		const callbackResponse = response();
		await handler("/callback")(req({ shieldpm_oidc: "nonce___state" }), callbackResponse);
		expect(callbackResponse.cookie).toHaveBeenCalledWith(
			"shieldpm_oidc_error",
			"OIDC authentication failed",
			expect.any(Object),
		);
		mocks.issue.mockRejectedValueOnce(new Error("private database credentials"));
		const claimResponse = response();
		await handler("/claim")(req({ shieldpm_oidc: "encrypted" }), claimResponse);
		expect(claimResponse.send).toHaveBeenCalledWith({ error: { message: "OIDC authentication failed" } });
	});

	it("uses an HTTP-only Lax cookie so state survives a top-level identity-provider callback", async () => {
		const res = response();
		await handler("/")(req(), res);
		expect(res.cookie).toHaveBeenCalledWith(
			"shieldpm_oidc",
			"nonce___state",
			expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: true, maxAge: 300000 }),
		);
	});

	it.each([{}, { shieldpm_oidc: "malformed" }, { shieldpm_oidc: "nonce___" }])(
		"rejects missing or malformed login state: %j",
		async (cookies) => {
			const res = response();
			await handler("/callback")(req(cookies), res);
			expect(mocks.grant).not.toHaveBeenCalled();
			expect(res.redirect).toHaveBeenCalledWith("/login");
			expect(res.cookie).toHaveBeenCalledWith(
				"shieldpm_oidc_error",
				expect.stringContaining("OIDC login state"),
				expect.any(Object),
			);
		},
	);

	it("passes both cookie-bound nonce and state to authorization-code verification", async () => {
		await handler("/callback")(req({ shieldpm_oidc: "nonce___state" }), response());
		expect(mocks.grant).toHaveBeenCalledWith(expect.anything(), expect.any(URL), {
			expectedNonce: "nonce",
			expectedState: "state",
		});
	});

	it("verifies a claimed JWT and creates both access and refresh cookies", async () => {
		const res = response();
		await handler("/claim")(req({ shieldpm_oidc: "encrypted" }), res);
		expect(mocks.load).toHaveBeenCalledWith("jwt-token");
		expect(mocks.issue).toHaveBeenCalledWith(mocks.user, "user", expect.any(Object));
		expect(res.cookie).toHaveBeenCalledWith("shieldpm_jwt", "access", expect.any(Object));
		expect(res.cookie).toHaveBeenCalledWith(
			"shieldpm_refresh",
			"refresh",
			expect.objectContaining({ path: "/api/tokens" }),
		);
	});

	it("does not create a session from an expired encrypted JWT", async () => {
		mocks.load.mockRejectedValueOnce(new Error("Token expired"));
		const res = response();
		await handler("/claim")(req({ shieldpm_oidc: "encrypted" }), res);
		expect(mocks.issue).not.toHaveBeenCalled();
		expect(res.cookie).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(400);
	});
});
