import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ settings: null }));

vi.mock("express-rate-limit", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../internal/2fa-service.js", () => ({ default: {} }));
vi.mock("../../internal/token.js", () => ({ default: {} }));
vi.mock("../../lib/auth-cookies.js", () => ({
	clearAuthCookies: vi.fn(),
	clearDuoCookie: vi.fn(),
	readDuoCookie: vi.fn(),
	setAuthCookies: vi.fn(),
	setDuoCookie: vi.fn(),
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/validator/api.js", () => ({ default: async (_schema, data) => data }));
vi.mock("../../models/setting.js", () => ({
	default: { query: () => ({ where: () => ({ first: async () => state.settings }) }) },
}));
vi.mock("../../models/token.js", () => ({ default: () => ({}) }));
vi.mock("../../models/user.js", () => ({ default: { knex: () => ({}), query: () => ({}) } }));
vi.mock("../../models/user-2fa.js", () => ({ default: {} }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: () => ({}) }));

import tokens, { isLocalPasswordLoginForbidden } from "../../routes/tokens.js";

const postHandler = () => {
	const route = tokens.stack.find((layer) => layer.route?.path === "/" && layer.route.methods.post).route;
	return route.stack.filter((entry) => entry.method === "post").at(-1).handle;
};

describe("SSO enforcement for local password login", () => {
	beforeEach(() => {
		state.settings = null;
		vi.unstubAllEnvs();
	});
	afterEach(() => vi.unstubAllEnvs());

	it.each([
		[null, false],
		[{ meta: { enabled: true } }, false],
		[{ meta: { enabled: false, enforce_sso: true } }, false],
		[{ meta: { enabled: true, enforce_sso: true } }, true],
	])("resolves enforcement from the oidc setting: %j", async (settings, expected) => {
		state.settings = settings;
		await expect(isLocalPasswordLoginForbidden()).resolves.toBe(expected);
	});

	it("lets OIDC_ENFORCE_SSO=false override an enforced database setting", async () => {
		state.settings = { meta: { enabled: true, enforce_sso: true } };
		vi.stubEnv("OIDC_ENFORCE_SSO", "false");
		await expect(isLocalPasswordLoginForbidden()).resolves.toBe(false);
	});

	it("answers POST /tokens with 403 before validating credentials", async () => {
		state.settings = { meta: { enabled: true, enforce_sso: true } };
		const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
		await postHandler()(
			{
				body: { identity: "admin@example.test", secret: "correct-horse" },
				cookies: {},
				headers: {},
				ip: "203.0.113.5",
			},
			res,
			vi.fn(),
		);
		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.send).toHaveBeenCalledWith({
			error: { code: 403, message: expect.stringContaining("OIDC/SSO is enforced") },
		});
	});
});
