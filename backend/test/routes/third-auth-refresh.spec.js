import cookieParser from "cookie-parser";
import express from "express";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../models/user.js", async () => {
	const { default: knex } = await import("knex");
	state.db = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: { knex: () => state.db } };
});
vi.mock("../../models/user-2fa.js", () => ({ default: { hasActive2FA: async () => false } }));
vi.mock("../../models/token.js", () => ({ default: () => ({}) }));
vi.mock("../../internal/token.js", () => ({
	default: { getTokenFromEmail: vi.fn(), issueTokenPair: vi.fn(), refreshTokenPair: vi.fn() },
}));
vi.mock("../../internal/2fa-service.js", () => ({ default: {} }));
vi.mock("../../lib/encryption.js", () => ({ decrypt: vi.fn(), encrypt: vi.fn() }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../lib/validator/api.js", () => ({ default: async (_schema, data) => data }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: vi.fn() }));

import internalToken from "../../internal/token.js";
import errs from "../../lib/error.js";
import router from "../../routes/tokens.js";

let server;
let baseUrl;
beforeAll(async () => {
	const app = express();
	app.use(express.json(), cookieParser());
	app.use("/api/tokens", router);
	server = app.listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	baseUrl = `http://127.0.0.1:${server.address().port}/api/tokens`;
});
afterAll(async () => {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
	await state.db.destroy();
});

it("keeps a new login's cookies when an older pending refresh later fails", async () => {
	const started = Promise.withResolvers();
	const olderRefresh = Promise.withResolvers();
	internalToken.refreshTokenPair.mockImplementationOnce(() => {
		started.resolve();
		return olderRefresh.promise;
	});
	const pending = fetch(`${baseUrl}/refresh`, {
		method: "POST",
		headers: { Cookie: "shieldpm_refresh=expired-session" },
	});
	await started.promise;

	try {
		const user = { id: 7, email: "owner@example.test", roles: [] };
		internalToken.getTokenFromEmail.mockResolvedValueOnce({ user });
		internalToken.issueTokenPair.mockResolvedValueOnce({
			access_token: "new-access-token",
			refresh_token: "new-refresh-token",
			access_expires: new Date(Date.now() + 900000).toISOString(),
			refresh_expires: new Date(Date.now() + 86400000).toISOString(),
			user,
		});
		const login = await fetch(baseUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ identity: user.email, secret: "valid-password" }),
		});
		expect(login.status).toBe(200);
		const browserCookies = new Map();
		const acceptCookies = (response) => {
			for (const cookie of response.headers.getSetCookie()) {
				const [name, value] = cookie.split(";", 1)[0].split("=");
				if (value) browserCookies.set(name, value);
				else browserCookies.delete(name);
			}
		};
		acceptCookies(login);
		expect(browserCookies.get("shieldpm_refresh")).toBe("new-refresh-token");

		olderRefresh.reject(new errs.AuthError("Refresh token is invalid or expired"));
		const failed = await pending;
		expect(failed.status).toBe(401);
		acceptCookies(failed);
		expect(Object.fromEntries(browserCookies)).toEqual({
			shieldpm_jwt: "new-access-token",
			shieldpm_refresh: "new-refresh-token",
		});
		expect(failed.headers.getSetCookie()).toEqual([]);
	} finally {
		olderRefresh.reject(new errs.AuthError("Refresh token is invalid or expired"));
		await pending;
	}
});
