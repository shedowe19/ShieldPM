import Ajv from "ajv";
import cookieParser from "cookie-parser";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	fresh: vi.fn(),
	loginAs: vi.fn(),
	grant: vi.fn(),
	oauth: vi.fn(),
	load: vi.fn(),
	issue: vi.fn(),
	refresh: vi.fn(),
	findUser: vi.fn(),
}));
vi.mock("openid-client", () => ({ discovery: async () => ({}), authorizationCodeGrant: state.grant }));
vi.mock("../../internal/token.js", () => ({
	default: {
		getFreshToken: state.fresh,
		getTokenFromOAuthClaim: state.oauth,
		issueTokenPair: state.issue,
		refreshTokenPair: state.refresh,
	},
}));
vi.mock("../../internal/user.js", () => ({ default: { loginAs: state.loginAs } }));
vi.mock("../../internal/2fa-service.js", () => ({ default: {} }));
vi.mock("../../models/user.js", () => ({
	default: { query: () => ({ findById: () => ({ where: state.findUser }) }) },
}));
vi.mock("../../models/user-2fa.js", () => ({ default: {} }));
vi.mock("../../models/token.js", () => ({ default: () => ({ load: state.load }) }));
vi.mock("../../models/setting.js", () => ({
	default: {
		query: () => ({
			where: () => ({ first: async () => ({ meta: { enabled: true, issuerURL: "https://idp.example.test" } }) }),
		}),
	},
}));
vi.mock("../../lib/access.js", () => ({ default: class {} }));
vi.mock("../../lib/config.js", () => ({ isDestructiveTestMode: () => false, getEncryptionKey: () => "01".repeat(32) }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/validator/index.js", () => ({ default: async (_schema, data) => data }));
vi.mock("../../lib/validator/api.js", () => ({ default: async (_schema, data) => data }));
vi.mock("../../setup.js", () => ({ isSetup: async () => true }));

import oidc from "../../routes/oidc.js";
import tokens from "../../routes/tokens.js";
import users from "../../routes/users.js";
import { getCompiledSchema } from "../../schema/index.js";

const expires = new Date(Date.now() + 86_400_000).toISOString();
const user = {
	id: 7,
	created_on: "2026-09-08T12:00:00.000Z",
	modified_on: "2026-09-08T12:00:00.000Z",
	is_disabled: false,
	email: "user@example.test",
	name: "Example User",
	nickname: "example",
	avatar: "",
	roles: [],
};

// Same-origin cookie storage for the real HTTP redirect/refresh/claim sequence.
// Respect Path and expiry: the scoped refresh cookie is not sent to the callback.
const browserCookies = () => {
	const cookies = new Map(
		[
			{ name: "shieldpm_oidc", value: "nonce___state", path: "/" },
			{ name: "shieldpm_jwt", value: "old-access", path: "/" },
			{ name: "shieldpm_refresh", value: "old-refresh", path: "/api/tokens" },
			{ name: "shieldpm_jwt_original", value: "old-admin", path: "/" },
			{ name: "shieldpm_duo", value: "old-duo-binding", path: "/api/tokens/2fa/duo" },
		].map((cookie) => [`${cookie.path}:${cookie.name}`, cookie]),
	);
	return {
		header(path) {
			return [...cookies.values()]
				.filter((cookie) => cookie.path === "/" || path === cookie.path || path.startsWith(`${cookie.path}/`))
				.map((cookie) => `${cookie.name}=${cookie.value}`)
				.join("; ");
		},
		apply(response) {
			for (const value of response.headers.getSetCookie()) {
				const [assignment, ...attributes] = value.split("; ");
				const separator = assignment.indexOf("=");
				const name = assignment.slice(0, separator);
				const path = attributes.find((attribute) => attribute.startsWith("Path="))?.slice(5) || "/";
				const expiry = attributes.find((attribute) => attribute.startsWith("Expires="))?.slice(8);
				const key = `${path}:${name}`;
				if (expiry && new Date(expiry).getTime() <= Date.now()) cookies.delete(key);
				else cookies.set(key, { name, value: assignment.slice(separator + 1), path });
			}
		},
	};
};

describe("HTTP authentication responses match the published schema", () => {
	let server;
	let origin;
	let schema;
	const ajv = new Ajv({ strict: false, validateFormats: false });
	beforeEach(() => vi.clearAllMocks());
	beforeAll(async () => {
		schema = await getCompiledSchema();
		const app = express();
		app.use(express.json(), cookieParser());
		app.use("/api/tokens", tokens);
		app.use("/api/users", users);
		app.use("/api/oidc", oidc);
		server = app.listen(0, "127.0.0.1");
		await new Promise((resolve) => server.once("listening", resolve));
		origin = `http://127.0.0.1:${server.address().port}`;
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});

	it("describes impersonation as a cookie-only token handoff with its user profile", async () => {
		state.loginAs.mockResolvedValueOnce({ token: "private-impersonation-jwt", expires, user });
		const response = await fetch(`${origin}/api/users/7/login`, {
			method: "POST",
			headers: { Cookie: "shieldpm_jwt=original-jwt" },
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ expires, user });
		expect(response.headers.getSetCookie()).toEqual(
			expect.arrayContaining([expect.stringContaining("shieldpm_jwt=private-impersonation-jwt;")]),
		);
		const contract = schema.paths["/users/{userID}/login"].post.responses[200].content["application/json"].schema;
		const validate = ajv.compile(contract);
		expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
		expect(validate({ ...body, token: "must-stay-in-cookie" })).toBe(false);
	});

	it("accepts the legacy renewal's minimal user identity without permitting arbitrary fields", async () => {
		state.fresh.mockResolvedValueOnce({ token: "renewed-jwt", expires, user: { id: 7 } });
		const response = await fetch(`${origin}/api/tokens`);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toEqual({ token: "renewed-jwt", expires, user: { id: 7 } });
		const contract = schema.paths["/tokens"].get.responses[200].content["application/json"].schema;
		const validate = ajv.compile(contract);
		expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
		expect(validate({ ...body, user: { id: 7, secret: "private" } })).toBe(false);
		expect(validate({ token: body.token, expires })).toBe(true);
	});

	it("replaces this browser's old session before the OIDC return can restore it", async () => {
		const cookies = browserCookies();
		state.grant.mockResolvedValueOnce({ claims: () => ({ email: user.email, email_verified: true }) });
		state.oauth.mockResolvedValueOnce({ token: "temporary-oidc-jwt", expires });
		state.load.mockResolvedValueOnce({ attrs: { id: user.id }, scope: ["user"] });
		state.findUser.mockResolvedValueOnce(user);
		state.issue.mockResolvedValueOnce({
			access_token: "oidc-access",
			refresh_token: "oidc-refresh",
			access_expires: expires,
			refresh_expires: expires,
			user,
		});
		state.refresh.mockResolvedValue({
			access_token: "old-access",
			refresh_token: "old-refresh",
			access_expires: expires,
			refresh_expires: expires,
			user: { id: 1 },
		});
		const callback = await fetch(`${origin}/api/oidc/callback?code=code&state=state`, {
			headers: { Cookie: cookies.header("/api/oidc/callback") },
			redirect: "manual",
		});
		expect(callback.status).toBe(302);
		cookies.apply(callback);
		const refresh = await fetch(`${origin}/api/tokens/refresh`, {
			method: "POST",
			headers: { Cookie: cookies.header("/api/tokens/refresh") },
		});
		expect(refresh.status).toBe(400);
		expect(state.refresh).not.toHaveBeenCalled();
		expect(callback.headers.get("location")).toBe("/");
		expect(cookies.header("/api/tokens/2fa/duo/callback")).not.toMatch(/shieldpm_(?:jwt|refresh|duo)=/);
		expect(cookies.header("/api/tokens/restore")).not.toContain("shieldpm_jwt_original=");
		cookies.apply(refresh);
		const claim = await fetch(`${origin}/api/oidc/claim`, {
			method: "POST",
			headers: { Cookie: cookies.header("/api/oidc/claim") },
		});
		expect(claim.status).toBe(200);
		expect(await claim.json()).toEqual({ expires, user });
		expect(state.load).toHaveBeenCalledWith("temporary-oidc-jwt");
		cookies.apply(claim);
		expect(cookies.header("/api/tokens/refresh")).toBe("shieldpm_jwt=oidc-access; shieldpm_refresh=oidc-refresh");
	});

	it("preserves the current browser session when OIDC callback verification fails", async () => {
		const cookies = browserCookies();
		state.grant.mockRejectedValueOnce(new Error("Provider rejected code"));
		state.refresh.mockResolvedValueOnce({
			access_token: "old-access",
			refresh_token: "old-refresh",
			access_expires: expires,
			refresh_expires: expires,
			user: { id: 1 },
		});
		const callback = await fetch(`${origin}/api/oidc/callback?code=bad-code&state=state`, {
			headers: { Cookie: cookies.header("/api/oidc/callback") },
			redirect: "manual",
		});
		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe("/login");
		cookies.apply(callback);
		expect(cookies.header("/api/tokens/restore")).toContain("shieldpm_jwt_original=old-admin");
		expect(cookies.header("/api/tokens/2fa/duo/callback")).toContain("shieldpm_duo=old-duo-binding");
		const refresh = await fetch(`${origin}/api/tokens/refresh`, {
			method: "POST",
			headers: { Cookie: cookies.header("/api/tokens/refresh") },
		});
		expect(refresh.status).toBe(200);
		expect((await refresh.json()).user).toEqual({ id: 1 });
		expect(state.oauth).not.toHaveBeenCalled();
		expect(state.issue).not.toHaveBeenCalled();
	});
});
