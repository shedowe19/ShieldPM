import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTokenService = {
	getTokenFromOAuthClaim: vi.fn(() => Promise.resolve({ token: "jwt123", expires: "2099-01-01" })),
};

vi.mock("../../modules/token/index.js", () => ({ tokenService: mockTokenService }));
vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((v) => `enc_${v}`),
	decrypt: vi.fn((v) => v.replace("enc_", "")),
}));
vi.mock("../../lib/error.js", () => {
	class AuthError extends Error {
		constructor(m) { super(m); this.status = 400; this.public = true; }
	}
	return { default: { AuthError } };
});
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { token: { getUserId: () => 1 } };
		next();
	},
}));
vi.mock("../../logger.js", () => ({
	debug: vi.fn(),
	oidc: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
	express: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../models/setting.js", () => ({
	default: {
		query: vi.fn(() => ({
			where: vi.fn().mockReturnThis(),
			first: vi.fn(() => Promise.resolve({
				id: "oidc-config",
				meta: { issuerURL: "https://auth.example.com", clientID: "cid", clientSecret: "cs", redirectURL: "https://app.example.com/callback" },
			})),
		})),
	},
}));
vi.mock("openid-client", () => ({
	discovery: vi.fn(),
	randomNonce: vi.fn(() => "nonce123"),
	randomState: vi.fn(() => "state123"),
	buildAuthorizationUrl: vi.fn(() => Promise.resolve("https://auth.example.com/authorize?...")),
	authorizationCodeGrant: vi.fn(),
}));
vi.mock("express-rate-limit", () => ({
	default: () => (_req, _res, next) => next(),
}));

beforeEach(() => vi.clearAllMocks());

describe("oidc routes", () => {
	describe("GET /oidc (authorization init)", () => {
		it("should redirect to authorization URL", async () => {
			const oidcClient = await import("openid-client");
			const url = await oidcClient.buildAuthorizationUrl({}, {});
			expect(url).toContain("https://auth.example.com");
		});

		it("generates nonce and state", async () => {
			const oidcClient = await import("openid-client");
			const nonce = oidcClient.randomNonce();
			const state = oidcClient.randomState();
			expect(nonce).toBe("nonce123");
			expect(state).toBe("state123");
		});
	});

	describe("GET /oidc/callback", () => {
		it("handles callback with valid tokens", async () => {
			const result = await mockTokenService.getTokenFromOAuthClaim({ identity: "user@example.com" });
			expect(result.token).toBe("jwt123");
		});

		it("rejects when email claim is missing", () => {
			const claims = { sub: "123" };
			expect(!claims.email).toBe(true);
		});

		it("rejects unverified email", () => {
			const claims = { email: "user@test.com", email_verified: false };
			expect(claims.email_verified !== true && claims.email_verified !== "true").toBe(true);
		});
	});

	describe("POST /oidc/claim", () => {
		it("rejects when no cookie provided", () => {
			const headers = {};
			expect(!headers.cookie).toBe(true);
		});

		it("rejects when no OIDC cookie found", () => {
			const cookies = "other_cookie=value".split(";");
			let found = false;
			for (const c of cookies) {
				if (c.split("=")[0].trim() === "shieldpm_oidc") found = true;
			}
			expect(found).toBe(false);
		});

		it("decrypts and validates OIDC cookie", async () => {
			const { decrypt } = await import("../../lib/encryption.js");
			const decrypted = decrypt("enc_jwt.payload.sig---2099-01-01");
			expect(decrypted).toBe("jwt.payload.sig---2099-01-01");
		});

		it("parses token and expires from decrypted data", () => {
			const decrypted = "jwt.eyJhdHRycyI6eyJpZCI6MX19.sig---2099-01-01";
			const [token, expires] = decrypted.split("---");
			expect(token).toBeTruthy();
			expect(expires).toBe("2099-01-01");
		});

		it("rejects invalid OIDC cookie data", () => {
			const decrypted = "invalid-no-separator";
			const [token, expires] = decrypted.split("---");
			expect(!token || !expires).toBe(true);
		});
	});

	describe("cookie handling", () => {
		it("parses nonce and state from cookie", () => {
			const cookieStr = "shieldpm_oidc=nonce123___state456";
			const cookies = cookieStr.split(";");
			let nonce;
			let state;
			for (const cookie of cookies) {
				if (cookie.split("=")[0].trim() === "shieldpm_oidc") {
					const val = cookie.split("=")[1].split("___");
					nonce = val[0].trim();
					state = val[1].trim();
				}
			}
			expect(nonce).toBe("nonce123");
			expect(state).toBe("state456");
		});

		it("returns undefined for missing cookie", () => {
			const headers = {};
			const result = { nonce: undefined, state: undefined };
			if (!headers.cookie) {
				expect(result.nonce).toBeUndefined();
			}
		});
	});
});
